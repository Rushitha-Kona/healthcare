const mongoose = require('mongoose');

const NutritionSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    date: { type: Date, default: Date.now }, // ✅ Auto-set article date
});

module.exports = mongoose.model('Nutrition', NutritionSchema);
