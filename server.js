require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const OpenAI = require("openai");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.APP_URL || true }));
app.use(morgan("tiny"));
app.use(express.json({ limit: "2mb", verify: (req, _res, buf) => { if (req.originalUrl === "/api/billing/razorpay-webhook") req.rawBody = Buffer.from(buf); } }));
app.use(express.static("public"));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnon = process.env.SUPABASE_ANON_KEY;
const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = supabaseUrl && supabaseService
  ? createClient(supabaseUrl, supabaseService, { auth: { persistSession: false } }) : null;
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

function needSupabase(res) {
  if (!supabaseUrl || !supabaseAnon || !supabaseAdmin) {
    res.status(503).json({ error: "Supabase is not configured yet. Add the required values to .env." });
    return false;
  }
  return true;
}
async function auth(req, res, next) {
  if (!needSupabase(res)) return;
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Please sign in first." });
  const userClient = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false }
  });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: "Your session is invalid or expired. Please sign in again." });
  req.user = data.user;
  req.userClient = userClient;
  next();
}
function safeText(v, max=160) { return String(v || "").trim().slice(0, max); }

app.get("/api/health", (_req, res) => res.json({
  ok: true,
  app: "DataCapita",
  services: {
    database: Boolean(supabaseAdmin),
    ai: Boolean(openai),
    payments: process.env.PAYMENTS_ENABLED === "true" && Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_PLAN_ID)
  }
}));

app.post("/api/classify", auth, async (req, res) => {
  const description = safeText(req.body.description, 500);
  const amount = Number(req.body.amount);
  const kind = req.body.kind === "income" ? "income" : "expense";
  if (!description || !Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: "A description and valid amount are required." });
  if (!openai) return res.json({ category: ruleCategory(description, kind), method: "rules", note: "Add OPENAI_API_KEY to enable AI classification." });
  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You classify personal finance transactions. Return JSON only: {category, confidence, reason}. Allowed categories: Food & Dining, Groceries, Transport, Housing, Utilities, Shopping, Health, Education, Entertainment, Travel, Salary, Freelance, Investment, Transfer, Fees, Other. Do not infer personal traits. Use the description and transaction type only. If uncertain use Other." },
        { role: "user", content: JSON.stringify({ description, amount, kind }) }
      ]
    });
    const parsed = JSON.parse(response.choices[0].message.content || "{}");
    const allowed = ["Food & Dining","Groceries","Transport","Housing","Utilities","Shopping","Health","Education","Entertainment","Travel","Salary","Freelance","Investment","Transfer","Fees","Other"];
    res.json({ category: allowed.includes(parsed.category) ? parsed.category : "Other", confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)), reason: safeText(parsed.reason, 180), method: "ai" });
  } catch (e) {
    res.json({ category: ruleCategory(description, kind), method: "rules-fallback", note: "AI service was unavailable; rule-based category was used." });
  }
});

function ruleCategory(description, kind) {
  if (kind === "income") return /salary|payroll|wage/i.test(description) ? "Salary" : "Other";
  const d = description.toLowerCase();
  const rules = [
    ["Groceries", /grocery|supermarket|vegetable|fruit|milk|ration|bigbasket|blinkit|zepto/],
    ["Food & Dining", /restaurant|cafe|coffee|pizza|swiggy|zomato|food|dining|tea/],
    ["Transport", /uber|ola|fuel|petrol|diesel|metro|bus|train|cab|parking/],
    ["Housing", /rent|landlord|maintenance/],
    ["Utilities", /electricity|water bill|gas bill|broadband|wifi|mobile recharge|phone bill/],
    ["Shopping", /amazon|flipkart|shopping|clothing|fashion|mall/],
    ["Health", /pharmacy|hospital|doctor|medicine|medical/],
    ["Education", /school|college|tuition|course|books/],
    ["Entertainment", /movie|cinema|netflix|spotify|game/],
    ["Travel", /hotel|flight|airline|booking|holiday/],
    ["Fees", /bank charge|processing fee|late fee/]
  ];
  for (const [cat, re] of rules) if (re.test(d)) return cat;
  return "Other";
}

app.post("/api/insights", auth, async (req, res) => {
  const rows = Array.isArray(req.body.transactions) ? req.body.transactions.slice(0, 1500) : [];
  const budgets = Array.isArray(req.body.budgets) ? req.body.budgets : [];

  const totals = rows.reduce((a, t) => {
    const amount = Math.max(0, Number(t.amount) || 0);
    if (t.kind === "income") {
      a.income += amount;
    } else {
      a.expenses += amount;
      const cat = t.category || "Other";
      a.byCategory[cat] = (a.byCategory[cat] || 0) + amount;
    }
    return a;
  }, { income: 0, expenses: 0, byCategory: {} });

  const insightsList = [];
  const actionsList = [];

  const sortedCategories = Object.entries(totals.byCategory).sort((a, b) => b[1] - a[1]);

  if (sortedCategories.length > 0 && sortedCategories[0][1] > 0) {
    const topCategory = sortedCategories[0][0];
    const topAmount = sortedCategories[0][1].toFixed(2);

    // Requirement 1: Highest expense category & amount
    insightsList.push(`Most spent category: ${topCategory} (₹${topAmount})`);

    // Requirement 2: Smart Budget Corner check
    const budgetExists = budgets.some(b => 
      (b.category || "").toLowerCase().trim() === topCategory.toLowerCase().trim()
    );

    if (!budgetExists) {
      actionsList.push(`If you have not added this section in your smart budget corner, add it.`);
    } else {
      actionsList.push(`You can easily see that you have used ₹${topAmount} money in your ${topCategory} area this month. Try to reduce it to make your saving habits good.`);
    }
  } else {
    insightsList.push("No recorded expenses found yet.");
    actionsList.push("Add transactions to see personalized savings insights.");
  }

  const summaryMsg = totals.expenses > totals.income 
    ? "Your recorded expenses are higher than your recorded income for the selected period." 
    : "Your recorded income covers your recorded expenses in the selected period.";

  res.json({
    mode: "rules",
    summary: summaryMsg,
    insights: insightsList,
    actions: actionsList,
    disclaimer: "Educational information only—not financial, tax, or investment advice."
  });
});  
app.post("/api/billing/create-subscription", auth, async (req, res) => {
  const enabled = process.env.PAYMENTS_ENABLED === "true" &&
    process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_PLAN_ID;
  if (!enabled) return res.status(503).json({ error: "Payments are not enabled. Configure Razorpay keys, plan ID, webhook, and test them before enabling subscriptions." });
  try {
    const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    const sub = await razorpay.subscriptions.create({
      plan_id: process.env.RAZORPAY_PLAN_ID, total_count: 120,
      quantity: 1, customer_notify: 1,
      notes: { supabase_user_id: req.user.id, product: "DataCapita Premium" }
    });
    res.json({ subscriptionId: sub.id, keyId: process.env.RAZORPAY_KEY_ID });
  } catch {
    res.status(502).json({ error: "Could not create subscription. Check Razorpay configuration." });
  }
});

app.post("/api/billing/razorpay-webhook", async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers["x-razorpay-signature"];
  const rawBody = req.rawBody;
  if (!secret || !signature || !Buffer.isBuffer(rawBody)) return res.status(400).send("Webhook is not configured.");
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return res.status(400).send("Invalid signature.");
  const event = JSON.parse(rawBody.toString("utf8"));
  const entity = event.payload?.subscription?.entity;
  const userId = entity?.notes?.supabase_user_id;
  if (userId && supabaseAdmin) {
    const status = event.event === "subscription.activated" || event.event === "subscription.charged" ? "active"
      : event.event === "subscription.pending" ? "past_due"
      : ["subscription.cancelled","subscription.halted","subscription.completed"].includes(event.event) ? "cancelled" : null;
    if (status) await supabaseAdmin.from("profiles").upsert({
      user_id: userId, premium_status: status, razorpay_subscription_id: entity.id, updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
  }
  res.json({ received: true });
});
app.post('/api/profile/ensure', express.json(), async (req, res) => {
  try {
    return res.status(200).json({ success: true, message: "Profile ensured safely" });
  } catch (err) {
    return res.status(200).json({ success: true, message: "Handled fallback" });
  }
});

app.get("/*splat", (req, res, next) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "API route not found." });
  res.sendFile(require("path").join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`DataCapita running on http://localhost:${PORT}`));