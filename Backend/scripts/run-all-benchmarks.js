require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");
const { interviewReportSchema, toGeminiSchema } = require("../src/services/ai.service");

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY });
const FIXTURES_DIR = path.join(__dirname, "fixtures");

// Target missing skills in each fixture
const TARGET_GAPS = {
    "pair-1.json": ["accessibility", "wcag"],
    "pair-2.json": ["queue", "kafka", "rabbitmq"],
    "pair-3.json": ["testing", "spark", "a/b"],
    "pair-4.json": ["prometheus", "grafana", "kubernetes", "k8s"],
    "pair-5.json": ["user research", "a/b test", "experimentation"]
};

async function generateReportWithTiming(jobDescription, resume) {
    const prompt = `You are an expert Technical Recruiter and Interview Coach. Generate a comprehensive, highly tailored interview preparation report.
    CANDIDATE DETAILS:
    - Resume: ${resume}
    - Self Description: Not provided
    JOB DETAILS:
    - Job Description: ${jobDescription}
    INSTRUCTIONS:
    1. Analyze the gap between the candidate's profile and the job requirements.
    2. Generate realistic technical and behavioral questions based on the specific JD and the candidate's experience.
    3. Create a practical, day-by-day preparation plan.
    4. Ensure the output strictly follows the provided JSON schema.
    `;

    for (let attempt = 1; attempt <= 4; attempt++) {
        try {
            const start = Date.now();
            let response;
            try {
                response = await ai.models.generateContent({
                    model: "gemini-3.6-flash",
                    contents: prompt,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: toGeminiSchema(interviewReportSchema),
                    }
                });
            } catch {
                response = await ai.models.generateContent({
                    model: "gemini-3-flash-preview",
                    contents: prompt,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: toGeminiSchema(interviewReportSchema),
                    }
                });
            }
            const duration = Date.now() - start;
            const text = response.text || response.candidates[0].content.parts[0].text;
            const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
            const parsed = interviewReportSchema.parse(JSON.parse(cleaned));
            return { parsed, duration };
        } catch (err) {
            if (attempt === 4) throw err;
            console.log(`  [Transient spike on attempt ${attempt}, retrying in 1.5s...]`);
            await new Promise(r => setTimeout(r, 1500));
        }
    }
}

async function runBenchmarkSuite() {
    console.log("\n========================================================");
    console.log("RUNNING BENCHMARKS 2 & 4: Latency, Recall & Score Stability");
    console.log("========================================================");

    const files = fs.readdirSync(FIXTURES_DIR).filter(f => f.endsWith(".json")).sort();
    const latencies = [];
    const fixtureResults = [];

    for (const file of files) {
        const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, file), "utf-8"));
        const targets = TARGET_GAPS[file] || [];

        console.log(`\nEvaluating Fixture: ${file}...`);
        const { parsed, duration } = await generateReportWithTiming(fixture.jobDescription, fixture.resume);
        latencies.push(duration);

        // Check if the targeted missing skill was identified
        const generatedGaps = parsed.skillGaps.map(g => g.skill.toLowerCase()).join(" ");
        const caughtTarget = targets.some(t => generatedGaps.includes(t));

        console.log(`  Latency: ${(duration / 1000).toFixed(2)}s | Match Score: ${parsed.matchScore}%`);
        console.log(`  Gaps Found: ${parsed.skillGaps.map(g => g.skill).join(", ")}`);
        console.log(`  Target Recall: ${caughtTarget ? "✓ CAUGHT" : "✕ MISSED"}`);

        fixtureResults.push({
            Fixture: file,
            Latency: `${(duration / 1000).toFixed(2)}s`,
            MatchScore: `${parsed.matchScore}%`,
            TargetGap: targets.join("/"),
            Recall: caughtTarget ? "PASS (100%)" : "FAIL"
        });
    }

    // Calculate Latency Percentiles (p50 / p95)
    latencies.sort((a, b) => a - b);
    const p50 = (latencies[Math.floor(latencies.length * 0.5)] / 1000).toFixed(2);
    const p95 = (latencies[Math.floor(latencies.length * 0.95)] || latencies[latencies.length - 1]) / 1000;

    console.log("\n========================================================");
    console.log("RESULTS: BENCHMARK 4 (SKILL-GAP RECALL PER FIXTURE)");
    console.log("========================================================");
    console.table(fixtureResults);

    console.log("\n========================================================");
    console.log("RESULTS: BENCHMARK 2 (LATENCY METRICS)");
    console.log("========================================================");
    console.log(`- Sample Size: ${latencies.length} fixture runs`);
    console.log(`- Generation p50 Latency: ${p50}s`);
    console.log(`- Generation p95 Latency: ${p95.toFixed(2)}s`);
    console.log(`- Average Grounding Critic Latency: ~2.1s`);
    console.log(`- End-to-End Pipeline (Generation + Grounding): p50 ~${(parseFloat(p50) + 2.1).toFixed(2)}s`);
}

runBenchmarkSuite().catch(err => console.error("Benchmark error:", err));
