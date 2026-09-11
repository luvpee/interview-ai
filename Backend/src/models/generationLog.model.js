const mongoose = require('mongoose');

const generationLogSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user"
    },
    prompt: {
        type: String
    },
    rawResponse: {
        type: String
    },
    validatedOutput: {
        type: mongoose.Schema.Types.Mixed
    },
    status: {
        type: String,
        enum: ["success", "failure"],
        required: true
    },
    attempts: {
        type: Number,
        required: true
    }
}, {
    timestamps: true
})

const generationLogModel = mongoose.model("GenerationLog", generationLogSchema)

module.exports = generationLogModel
