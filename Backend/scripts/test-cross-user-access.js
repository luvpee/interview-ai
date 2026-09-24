require("dotenv").config();
const http = require("http");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const connectDB = require("../src/config/database");
const interviewReportModel = require("../src/models/interviewReport.model");

async function runTests() {
    console.log("\n========================================================");
    console.log("BENCHMARK 5: Cross-User Access Security Test Suite");
    console.log("========================================================");

    await connectDB();

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(3099, "127.0.0.1", resolve));
    const baseUrl = `http://127.0.0.1:3099`;

    try {
        const userA_id = new mongoose.Types.ObjectId();
        const userB_id = new mongoose.Types.ObjectId();

        const tokenA = jwt.sign({ id: userA_id.toString() }, process.env.JWT_SECRET);
        const tokenB = jwt.sign({ id: userB_id.toString() }, process.env.JWT_SECRET);

        const reportA = await interviewReportModel.create({
            user: userA_id,
            jobDescription: "Test Job Description for User A",
            matchScore: 85,
            technicalQuestions: [{ question: "Tech Q1", intention: "Test", answer: "Ans" }],
            behavioralQuestions: [{ question: "Beh Q1", intention: "Test", answer: "Ans" }],
            skillGaps: [{ skill: "Docker", severity: "medium" }],
            preparationPlan: [{ day: 1, focus: "Testing", tasks: ["Task 1"] }],
            title: "Software Engineer Test"
        });

        console.log(`Created test report (${reportA._id}) owned by User A (${userA_id})\n`);

        async function request(path, options = {}) {
            return new Promise((resolve, reject) => {
                const url = new URL(path, baseUrl);
                const req = http.request(url, options, res => {
                    let data = "";
                    res.on("data", chunk => data += chunk);
                    res.on("end", () => resolve({ status: res.statusCode, body: data }));
                });
                req.on("error", reject);
                if (options.body) req.write(options.body);
                req.end();
            });
        }

        let passed = 0;
        let total = 0;

        async function assertTest(name, fn) {
            total++;
            try {
                await fn();
                console.log(`  ✓ [PASS] ${name}`);
                passed++;
            } catch (err) {
                console.error(`  ✕ [FAIL] ${name}:`, err.message);
            }
        }

        // Test 1: Unauthenticated request to /api/interview/
        await assertTest("Test 1: Unauthenticated request returns 401", async () => {
            const res = await request("/api/interview/");
            if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
        });

        // Test 2: User B requests User A's report by ID
        await assertTest("Test 2: User B requesting User A's report returns 404", async () => {
            const res = await request(`/api/interview/report/${reportA._id}`, {
                headers: { Cookie: `token=${tokenB}` }
            });
            if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
        });

        // Test 3: User B requests User A's PDF resume
        await assertTest("Test 3: User B requesting User A's PDF resume returns 404", async () => {
            const res = await request(`/api/interview/resume/pdf/${reportA._id}`, {
                method: "POST",
                headers: { Cookie: `token=${tokenB}` }
            });
            if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
        });

        // Test 4: User B submits feedback on User A's report
        await assertTest("Test 4: User B rating User A's question returns 404", async () => {
            const res = await request(`/api/interview/report/${reportA._id}/feedback`, {
                method: "POST",
                headers: {
                    Cookie: `token=${tokenB}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ type: "technical", questionIndex: 0, rating: "up" })
            });
            if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
        });

        // Test 5: User B lists all reports - must not include User A's report
        await assertTest("Test 5: User B report listing isolates User A's data", async () => {
            const res = await request("/api/interview/", {
                headers: { Cookie: `token=${tokenB}` }
            });
            if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
            const data = JSON.parse(res.body);
            const foundA = (data.interviewReports || []).some(r => r._id === reportA._id.toString());
            if (foundA) throw new Error("Data leak: User A's report appeared in User B's reports list!");
        });

        // Test 6: User A can successfully access their own report
        await assertTest("Test 6: User A can successfully access their own report (200 OK)", async () => {
            const res = await request(`/api/interview/report/${reportA._id}`, {
                headers: { Cookie: `token=${tokenA}` }
            });
            if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        });

        await interviewReportModel.deleteOne({ _id: reportA._id });

        console.log(`\nResults: ${passed}/${total} tests passed (${Math.round((passed / total) * 100)}%)`);

    } finally {
        server.close();
        await mongoose.disconnect();
    }
}

runTests().catch(err => {
    console.error("Test error:", err);
    process.exit(1);
});
