require("dotenv").config()
const mongoose = require("mongoose")
const { checkGrounding } = require("../src/services/ai.service")

async function testGroundingDetection() {
    await mongoose.connect(process.env.MONGO_URI)
    console.log("MongoDB connected")

    console.log("\n========================================================")
    console.log("BENCHMARK 3: Grounding Detection (Planted Hallucinations)")
    console.log("========================================================")

    const jd = "Senior Frontend Engineer with 5+ years of React, TypeScript, Redux, and CSS experience."
    const resume = "Frontend developer with 4 years React and TypeScript experience. Worked with Redux and responsive CSS."

    // Report with planted hallucinations mixed in with valid items
    const fakeReport = {
        skillGaps: [
            { skill: "Web Accessibility (WCAG standards)", severity: "medium" }, // valid — not in resume, relevant to JD
            { skill: "Quantum Computing Algorithms (Qiskit)", severity: "high" }, // PLANTED HALLUCINATION
            { skill: "Rust Kernel Driver Development", severity: "high" }         // PLANTED HALLUCINATION
        ],
        technicalQuestions: [
            { question: "How does React fiber architecture handle reconciliation?", intention: "React knowledge", answer: "Virtual DOM reconciliation" }, // valid
            { question: "Can you explain the difference between Redux Toolkit createSlice and standard reducers?", intention: "Redux architecture", answer: "Redux structure" }, // valid
            { question: "How would you tune COBOL mainframe database transactions for ultra-low latency banking?", intention: "Testing COBOL", answer: "Mainframe optimization" }, // PLANTED HALLUCINATION
            { question: "Describe how you write Linux assembly drivers for proprietary PCI hardware.", intention: "Hardware drivers", answer: "Hardware driver code" } // PLANTED HALLUCINATION
        ],
        behavioralQuestions: [
            { question: "Tell me about a time you resolved a conflict between frontend and backend engineers.", intention: "Collaboration", answer: "STAR approach" }, // valid
            { question: "Describe your experience negotiating multimillion-dollar aerospace defense contracts with the Pentagon.", intention: "Defense contracts", answer: "Contract negotiation" } // PLANTED HALLUCINATION
        ]
    }

    // Valid items that should NOT be flagged (false-flag check)
    const validItems = [
        { text: "Web Accessibility (WCAG standards)", section: "skillGaps" },
        { text: "How does React fiber architecture handle reconciliation?", section: "technicalQuestions" },
        { text: "Tell me about a time you resolved a conflict between frontend and backend engineers.", section: "behavioralQuestions" }
    ]

    const result = await checkGrounding({ jobDescription: jd, resume, report: fakeReport })
    console.log("\nGrounding Results from Critic Model:")
    console.log("Skill Gaps Score:", result.skillGaps.score, "%")
    console.log("Skill Gaps Flagged:", result.skillGaps.flagged)
    console.log("\nTech Qs Score:", result.technicalQuestions.score, "%")
    console.log("Tech Qs Flagged:", result.technicalQuestions.flagged)
    console.log("\nBehavioral Qs Score:", result.behavioralQuestions.score, "%")
    console.log("Behavioral Qs Flagged:", result.behavioralQuestions.flagged)

    // --- Planted hallucination detection ---
    const planted = [
        "Quantum Computing Algorithms (Qiskit)",
        "Rust Kernel Driver Development",
        "COBOL mainframe database transactions",
        "Linux assembly drivers",
        "multimillion-dollar aerospace defense contracts"
    ]

    const allFlagged = [
        ...result.skillGaps.flagged,
        ...result.technicalQuestions.flagged,
        ...result.behavioralQuestions.flagged
    ].join(" ").toLowerCase()

    let caught = 0
    console.log("\n--- Planted hallucination detection ---")
    for (const p of planted) {
        const keywords = p.toLowerCase().split(" ").filter(w => w.length > 4)
        const match = keywords.some(k => allFlagged.includes(k))
        if (match) caught++
        console.log(`- Planted item "${p}": ${match ? "CAUGHT & FLAGGED" : "MISSED"}`)
    }
    console.log(`\nPlanted Detection Rate: ${caught}/${planted.length} (${Math.round((caught / planted.length) * 100)}%)`)

    // --- False-flag check (valid items the critic should NOT flag) ---
    console.log("\n--- False-flag check (valid items that should not be flagged) ---")
    let falseFlagged = 0
    for (const item of validItems) {
        const sectionFlags = result[item.section].flagged.join(" ").toLowerCase()
        const keywords = item.text.toLowerCase().split(" ").filter(w => w.length > 4)
        const incorrectlyFlagged = keywords.some(k => sectionFlags.includes(k))
        if (incorrectlyFlagged) falseFlagged++
        console.log(`- Valid item "${item.text.substring(0, 60)}...": ${incorrectlyFlagged ? "FALSE FLAG ✕" : "Correctly kept ✓"}`)
    }
    console.log(`\nFalse-Flag Rate: ${falseFlagged}/${validItems.length} (${Math.round((falseFlagged / validItems.length) * 100)}%)`)

    await mongoose.disconnect()
}

testGroundingDetection().catch(err => {
    console.error("Error in benchmark:", err)
    process.exit(1)
})
