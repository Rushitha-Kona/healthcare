require('dotenv').config();
const nodemailer = require('nodemailer');
console.log("News API Key:", process.env.NEWS_API_KEY);
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const User = require('./models/user');
const Nutrition = require('./models/nutrition');

const API_URL = 'https://api.edamam.com/api/recipes/v2';
const APP_ID =  process.env.EDAMAM_APP_ID // Get this from Edamam API
const APP_KEY = process.env.EDAMAM_APP_KEY;;

const app = express();

const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    res.redirect('/login');
};


// ✅ Secure API Keys from .env
const NEWS_API_KEY = process.env.NEWS_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const NEWS_URL ='https://newsapi.org/v2/everything?q=nutrition&language=en&apiKey=${NEWS_API_KEY};' 

// ✅ Initialize Gemini AI
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ✅ Connect to MongoDB
const dbURI = process.env.MONGO_URI;

mongoose.connect(dbURI)
  .then(() => {
    console.log('✅ MongoDB Connected');
    app.listen(4000, () => console.log('🚀 Server running on http://localhost:4000'));
  })
  .catch(err => console.log('❌ MongoDB Connection Error:', err));

// ✅ Set up EJS views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'frontend'));

// ✅ Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true,
}));

// ✅ Serve static files
app.use(express.static(path.join(__dirname, 'frontend')));

// ✅ Home Route
app.get('/', (req, res) => {
    res.render('index', { title: 'Home' });
});

// ✅ Register Page (GET)
app.get('/register', (req, res) => {
    res.render('register', { title: 'Register' });
});

// ✅ Register (POST)
app.post('/register', async (req, res) => {
    const { name, email, password } = req.body;

    try {
        // Hash password before saving to database
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ name, email, password: hashedPassword });

        await user.save();
        console.log("✅ Hashed Password Stored:", hashedPassword);
        res.redirect('/login');
    } catch (err) {
        console.error("❌ Error Registering User:", err);
        res.status(500).send("Error registering user");
    }
});


// ✅ Login Page (GET)
app.get('/login', (req, res) => {
    res.render('login', { title: 'Login' });
});

// ✅ Login (POST)
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (user && await bcrypt.compare(password, user.password)) {
            req.session.user = user;
            res.redirect('/');
        } else {
            res.send("❌ Invalid email or password");
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("Error logging in");
    }
});

const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: 'your-email@gmail.com',
        pass: 'your-email-password'
    }
});
// ✅ Forgot Password Page (GET)
app.get('/forgot-password', (req, res) => {
    res.render('forgot-password', { title: 'Forgot Password' });
});

// ✅ Update Password (POST)
app.post('/forgot-password', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.send("❌ Email not found");
        }

        // Hash new password and update user
        const hashedPassword = await bcrypt.hash(password, 10);
        user.password = hashedPassword;
        await user.save();

        res.redirect('/login'); // Redirect after password update
    } catch (err) {
        console.error("❌ Error resetting password:", err);
        res.status(500).send("Error resetting password");
    }
});




// ✅ Reset Password (POST)
// ✅ Reset Password Page (GET)
app.get('/reset-password/:token', async (req, res) => {
    const { token } = req.params;

    try {
        // Check if token is valid and not expired
        const user = await User.findOne({ resetToken: token, tokenExpiration: { $gt: Date.now() } });
        if (!user) {
            return res.send("❌ Invalid or expired token");
        }

        res.render('reset-password', { title: 'Reset Password', token }); // Pass token to form
    } catch (err) {
        console.error("❌ Error loading reset page:", err);
        res.status(500).send("Error loading reset password page");
    }
});

app.post('/reset-password/:token', async (req, res) => {
    const { token } = req.params;
    const { password } = req.body;

    try {
        // Find user with the valid token and ensure it's not expired
        const user = await User.findOne({ resetToken: token, tokenExpiration: { $gt: Date.now() } });
        if (!user) {
            return res.send("❌ Invalid or expired token");
        }

        // Hash new password and update user data
        const hashedPassword = await bcrypt.hash(password, 10);
        user.password = hashedPassword;
        user.resetToken = undefined;
        user.tokenExpiration = undefined;
        await user.save();

        res.redirect('/login');
    } catch (err) {
        console.error("❌ Error resetting password:", err);
        res.status(500).send("Error resetting password");
    }
});


// ✅ Profile Route (Protected)


// ✅ BMI Calculator Page
app.get('/bmi',isAuthenticated, (req, res) => {
    res.render('bmi', { title: 'BMI Calculator' });
});

// ✅ Diet Plan Page
app.get('/diet-plan',isAuthenticated, (req, res) => {
    res.render('diet-plan', { title: "Diet Plan", dietPlan: "" });
});

// ✅ Generate Diet Plan
app.post('/diet-plan', async (req, res) => {
    const { age, weight, goal, preference } = req.body;

    let dietPlan = {
        breakfast: "",
        lunch: "",
        dinner: "",
        snacks: ""
    };

    if (goal === "lose") {
        if (preference === "vegetarian") {
            dietPlan = {
                breakfast: "Chia pudding with almond milk & berries",
                lunch: "Lentil soup with a side of quinoa",
                dinner: "Grilled tofu with steamed broccoli & brown rice",
                snacks: "Greek yogurt with nuts & honey"
            };
        } else if (preference === "low-carb") {
            dietPlan = {
                breakfast: "Scrambled eggs with spinach & avocado",
                lunch: "Grilled salmon with roasted cauliflower",
                dinner: "Chicken stir-fry with zucchini noodles",
                snacks: "Cottage cheese with cucumber slices"
            };
        } else { // High-protein default
            dietPlan = {
                breakfast: "Egg white omelet with turkey bacon",
                lunch: "Grilled chicken with quinoa & steamed asparagus",
                dinner: "Lean steak with roasted Brussels sprouts",
                snacks: "Protein smoothie with banana & peanut butter"
            };
        }
    } else if (goal === "gain") {
        if (preference === "vegetarian") {
            dietPlan = {
                breakfast: "Oatmeal with almond butter & banana",
                lunch: "Chickpea curry with brown rice",
                dinner: "Grilled paneer with mixed vegetables",
                snacks: "Trail mix with nuts & dried fruits"
            };
        } else if (preference === "low-carb") {
            dietPlan = {
                breakfast: "Cheese omelet with avocado",
                lunch: "Grilled salmon with sautéed spinach",
                dinner: "Beef stir-fry with bell peppers & mushrooms",
                snacks: "Boiled eggs & a handful of almonds"
            };
        } else { // High-protein default
            dietPlan = {
                breakfast: "Scrambled eggs with whole wheat toast",
                lunch: "Chicken and sweet potato bowl",
                dinner: "Salmon with quinoa & steamed broccoli",
                snacks: "Greek yogurt with granola"
            };
        }
    } else { // Maintain weight
        if (preference === "vegetarian") {
            dietPlan = {
                breakfast: "Smoothie with spinach, banana & protein powder",
                lunch: "Grilled tofu salad with vinaigrette dressing",
                dinner: "Stir-fried veggies with chickpeas",
                snacks: "Hummus with whole grain crackers"
            };
        } else if (preference === "low-carb") {
            dietPlan = {
                breakfast: "Scrambled eggs with cheese & avocado",
                lunch: "Turkey lettuce wrap with cheese & mustard",
                dinner: "Baked chicken with cauliflower mash",
                snacks: "Celery sticks with peanut butter"
            };
        } else { // High-protein default
            dietPlan = {
                breakfast: "Protein pancakes with berries",
                lunch: "Grilled chicken Caesar salad",
                dinner: "Seared tuna with quinoa & greens",
                snacks: "Cottage cheese with walnuts"
            };
        }
    }

    res.render("diet-plan", { title: "Your Personalized Diet Plan", dietPlan });
});


// ✅ Fitness Tips Page
app.get('/fitness-tips', isAuthenticated,(req, res) => {
    const goal = req.session.goal; 
    let workoutTips = [];

    if (goal === "lose") {
        workoutTips = ["Do cardio like running, cycling.", "Incorporate HIIT.", "Strength train 2-3 times per week."];
    } else if (goal === "gain") {
        workoutTips = ["Focus on weight lifting.", "Eat enough protein.", "Train major muscle groups twice a week."];
    } else {
        workoutTips = ["Mix cardio and strength training.", "Follow a consistent routine.", "Eat a well-balanced diet."];
    }

    res.render('fitness-tips', { workoutTips });
});

// ✅ Chatbot Page (GET)
app.get('/chatbot', isAuthenticated,(req, res) => {
    res.render('chatbot', { title: 'Chatbot', botResponse: "" });  // Ensure botResponse is defined
});


// ✅ Chatbot API (POST) - Google Gemini AI
app.post('/chatbot', isAuthenticated,async (req, res) => {
    const userMessage = req.body.message;
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
        const result = await model.generateContent([userMessage]);

        // 🔍 Debugging: Print the entire API response
        console.log("🔍 Full Gemini API Response:", JSON.stringify(result, null, 2));

        // ✅ Extract response correctly
        let responseText = result.response?.candidates?.[0]?.content?.parts?.[0]?.text || "I couldn't understand that.";

        // ✅ Format text for better readability
        responseText = responseText.replace(/\n/g, "<br>");  // Convert line breaks to HTML <br>

        // ✅ Highlight important words with bold formatting & emojis
        responseText = responseText.replace(/balanced diet/gi, "🥗 <b>Balanced Diet</b>");
        responseText = responseText.replace(/exercise/gi, "🏋️‍♂️ <b>Exercise</b>");
        responseText = responseText.replace(/hydration/gi, "💧 <b>Hydration</b>");
        responseText = responseText.replace(/protein/gi, "🍗 <b>Protein</b>");
        responseText = responseText.replace(/carbohydrates/gi, "🍞 <b>Carbohydrates</b>");
        responseText = responseText.replace(/fats/gi, "🥑 <b>Healthy Fats</b>");

        console.log("✅ Bot Response:", responseText); // Debugging log

        res.json({ botResponse: responseText }); // Send formatted response
    } catch (error) {
        console.error("❌ Gemini AI API Error:", error);
        res.status(500).json({ botResponse: "🚨 Sorry, I'm unable to respond at the moment. Please try again later!" });
    }
});


// ✅ Diet Analysis Page (GET)
app.get('/diet-analysis', isAuthenticated,(req, res) => {
    res.render('diet-analysis', { title: 'Diet Analysis', analysis: null });
});

async function getNutritionData(ingredient) {
    try {
        const response = await axios.get("https://api.edamam.com/api/nutrition-data", {
            params: {
                app_id: "5eb45a56",
                app_key: "1b31089053b56291e586047bc379fdf2",
                ingr: ingredient,
            },
            headers: {
                "Edamam-Account-User": "Rushitha12", // Replace with your actual user ID
            },
        });

        return response.data;
    } catch (error) {
        console.error("API Error:", error.response?.data || error.message);
        return null; // Return null if the API call fails
    }}

// ✅ Diet Analysis (POST) - Analyze Calories
app.post("/diet-analysis", isAuthenticated,async (req, res) => {
    try {
        const { foodItems } = req.body;
        if (!foodItems) {
            return res.render("diet-analysis", { error: "Please enter food items.", analysis: null });
        }

        console.log("Requesting nutrition data for:", foodItems);

        // API Request
        const response = await axios.get("https://api.edamam.com/api/nutrition-data", {
            params: {
                app_id: process.env.EDAMAM_APP_ID,
                app_key: process.env.EDAMAM_APP_KEY,
                ingr: foodItems
            },
            headers: {
               "Edamam-Account-User": process.env.EDAMAM_USER_ID  // Ensure this is correctly formatted
            }
        });

        console.log("Edamam API Response:", JSON.stringify(response.data, null, 2)); // Debugging

        if (!response.data.totalNutrients || !response.data.totalNutrients.ENERC_KCAL) {
            return res.render("diet-analysis", { error: "Could not fetch nutrition data. Try different items.", analysis: null });
        }

        // Extracting data
        const totalCalories = response.data.totalNutrients.ENERC_KCAL.quantity;
        const recommendedCalories = 2000;
        const message = totalCalories > recommendedCalories
            ? "You have exceeded the recommended intake!"
            : "Your intake is within the recommended limit.";

        const foodDetails = response.data.ingredients?.map(ing => ({
            name: ing.text,
            calories: ing.parsed?.[0]?.nutrients?.ENERC_KCAL?.quantity || 0
        })) || [];

        res.render("diet-analysis", { error: null, analysis: { totalCalories, recommendedCalories, message, foodDetails } });

    } catch (err) {
        console.error("Error fetching data:", err.response ? err.response.data : err.message);
        res.render("diet-analysis", { error: "Something went wrong. Please try again.", analysis: null });
    }
});





// ✅ Nutrition Page
app.get('/nutrition', isAuthenticated,async (req, res) => {
    try {
        const response = await axios.get(NEWS_URL);
        const articles = response.data.articles.slice(0, 5);
        const savedArticles = await Nutrition.find();
        res.render('nutrition', { title: 'Daily Nutrition Guide', articles, savedArticles });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error fetching nutrition news.");
    }
});



let cachedRecipes = null; // Store recipes temporarily
let lastFetchTime = 0;

app.get('/recipes',isAuthenticated, async (req, res) => {
    const CACHE_DURATION = 60 * 60 * 1000; // Cache for 1 hour
    const now = Date.now();

    if (cachedRecipes && (now - lastFetchTime < CACHE_DURATION)) {
        console.log("✅ Serving from cache");
        return res.render('recipes', { title: "Healthy Recipes", recipes: cachedRecipes });
    }

    try {
        const response = await axios.get(API_URL, {
            params: {
                type: "public",
                q: "healthy",
                app_id: APP_ID,
                app_key: APP_KEY
            },
            headers: {
                'Edamam-Account-User': 'Rushitha12'
            }
        });

        cachedRecipes = response.data.hits.slice(0, 5).map(hit => ({
            title: hit.recipe.label,
            image: hit.recipe.image,
            ingredients: hit.recipe.ingredientLines,
            instructions: hit.recipe.url
        }));

        lastFetchTime = now;

        res.render('recipes', { title: "Healthy Recipes", recipes: cachedRecipes });

    } catch (error) {
        console.error("❌ Error fetching recipes:", error.response ? error.response.data : error.message);
        res.status(500).send("Error fetching recipes. API limit exceeded.");
    }
});




// ✅ Logout Route
// ✅ Logout (GET)
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("❌ Error logging out:", err);
            return res.status(500).send("Error logging out");
        }
        res.render('logout', { title: 'Logged Out' }); // Render logout.ejs
    });
});



// ✅ 404 Error Handler
app.use((req, res) => {
    res.status(404).render('404', { title: 'Error' });
}); 