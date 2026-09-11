class AIGenerationError extends Error {
    constructor(message, { attempts, cause } = {}) {
        super(message)
        this.name = "AIGenerationError"
        this.statusCode = 502
        this.attempts = attempts
        this.cause = cause
    }
}

module.exports = AIGenerationError
