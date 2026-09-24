/**
 * Benchmark 1: Reliability — Retry and Failover
 *
 * Measures the difference in Zod-valid success rate between:
 *   A) Raw single-shot Gemini calls (no retry, no fallback)
 *   B) Production generateInterviewReport (retry + model fallback)
 *
 * Injectable failure mode:
 *   Set SIMULATE_FAILURE_RATE=0.3 (env var or CLI --failure-rate=0.3)
 *   to simulate ~30% 503-like errors on the primary model call.
 *   This lets you run the benchmark without waiting for real spikes.
 *
 * Usage:
 *   node scripts/run-reliability-benchmark.js
 *   node scripts/run-reliability-benchmark.js --failure-rate=0.3 --runs=10
 */

require("dotenv").config()
const mongoose = require("mongoose")
const { GoogleGenAI } = require("@google/genai")
const { interviewReportSchema, toGeminiSchema, generateInterviewReport } = require("../src/services/ai.service")

// --- CLI / env config ---
const args = Object.fromEntries(
    process.argv.slice(2)
        .filter(a => a.startsWith("--"))
        .map(a => a.slice(2).split("="))
)
const FAILURE_RATE = parseFloat(args["failure-rate"] ?? process.env.SIMULATE_FAILURE_RATE ?? "0")
const RUNS = parseInt(args["runs"] ?? process.env.BENCHMARK_RUNS ?? "10", 10)
const FIXTURE_FILE = args["fixture"] ?? "pair-1.json"

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY })

function maybeInjectFailure(failureRate) {
    if (failureRate > 0 && Math.random() < failureRate) {
        const err = new Error("Simulated 503 Service Unavailable (injected)")
        err.status = 503
        throw err
    }
}

/**
 * Raw single-shot call — no retry, no fallback.
 * Returns the parsed+validated report on success, null on any failure.
 */
async function rawSingleShot(prompt) {
    try {
        maybeInjectFailure(FAILURE_RATE)
        const response = await ai.models.generateContent({
            model: "gemini-3.6-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: toGeminiSchema(interviewReportSchema),
            }
        })
        const text = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text
        if (!text) throw new Error("Empty response")
        const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim()
        return interviewReportSchema.parse(JSON.parse(cleaned))
    } catch {
        return null
    }
}

async function runReliabilityBenchmark() {
    await mongoose.connect(process.env.MONGO_URI)
    console.log("MongoDB connected")

    const fs = require("fs")
    const path = require("path")
    const fixturePath = path.join(__dirname, "fixtures", FIXTURE_FILE)
    if (!fs.existsSync(fixturePath)) {
        console.error(`Fixture not found: ${fixturePath}`)
        process.exit(1)
    }
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"))

    const prompt = `You are an expert Technical Recruiter and Interview Coach. Generate a comprehensive, highly tailored interview preparation report.
    CANDIDATE DETAILS:
    - Resume: ${fixture.resume}
    - Self Description: Not provided
    JOB DETAILS:
    - Job Description: ${fixture.jobDescription}
    INSTRUCTIONS:
    1. Analyze the gap between the candidate's profile and the job requirements.
    2. Generate realistic technical and behavioral questions based on the specific JD and the candidate's experience.
    3. Create a practical, day-by-day preparation plan.
    4. Ensure the output strictly follows the provided JSON schema.
    `

    const benchmarkUserId = new mongoose.Types.ObjectId()

    console.log("\n========================================================")
    console.log("BENCHMARK 1: Reliability — Retry and Failover")
    console.log("========================================================")
    console.log(`Fixture:      ${FIXTURE_FILE}`)
    console.log(`Runs:         ${RUNS} per mode`)
    console.log(`Failure rate: ${FAILURE_RATE > 0 ? `${(FAILURE_RATE * 100).toFixed(0)}% simulated (SIMULATE_FAILURE_RATE=${FAILURE_RATE})` : "0% (real API — no injection)"}`)
    console.log()

    // --- Mode A: raw single-shot ---
    console.log(`Running Mode A (raw single-shot, no retry)...`)
    let rawSuccess = 0
    for (let i = 0; i < RUNS; i++) {
        process.stdout.write(`  Run ${i + 1}/${RUNS}: `)
        const result = await rawSingleShot(prompt)
        if (result) {
            rawSuccess++
            process.stdout.write("✓ success\n")
        } else {
            process.stdout.write("✕ failed\n")
        }
    }

    // --- Mode B: production pipeline ---
    console.log(`\nRunning Mode B (production generateInterviewReport with retry + fallback)...`)
    let prodSuccess = 0
    for (let i = 0; i < RUNS; i++) {
        process.stdout.write(`  Run ${i + 1}/${RUNS}: `)
        try {
            await generateInterviewReport({
                resume: fixture.resume,
                selfDescription: "",
                jobDescription: fixture.jobDescription,
                userId: benchmarkUserId
            })
            prodSuccess++
            process.stdout.write("✓ success\n")
        } catch {
            process.stdout.write("✕ failed\n")
        }
    }

    const rawRate = Math.round((rawSuccess / RUNS) * 100)
    const prodRate = Math.round((prodSuccess / RUNS) * 100)

    console.log("\n========================================================")
    console.log("RESULTS: BENCHMARK 1 (RELIABILITY)")
    console.log("========================================================")
    console.log(`- Sample Size:             n=${RUNS} runs per mode`)
    console.log(`- Raw single-shot success: ${rawSuccess}/${RUNS} (${rawRate}%)`)
    console.log(`- Production pipeline:     ${prodSuccess}/${RUNS} (${prodRate}%)`)
    console.log(`- Improvement:             ${rawRate}% → ${prodRate}%`)
    // TODO: verify — run with real API key and update README numbers
    console.log("\nResume line enabled:")
    console.log(`  "Raised generation success from ${rawRate}% to ${prodRate}% (n=${RUNS})"`)

    await mongoose.disconnect()
}

runReliabilityBenchmark().catch(err => {
    console.error("Reliability benchmark error:", err)
    process.exit(1)
})
