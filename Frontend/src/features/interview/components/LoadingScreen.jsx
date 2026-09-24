import React, { useState, useEffect } from 'react'
import '../style/loadingScreen.scss'

const STAGES = [
    {
        title: "Analyzing Resume & Job Requirements",
        desc: "Extracting key technologies, qualifications, and role expectations from the target job...",
        badge: "Parsing Profile"
    },
    {
        title: "Detecting Skill Gaps & Alignment",
        desc: "Mapping your background against required competencies to calculate your candidate match score...",
        badge: "Evaluating Match"
    },
    {
        title: "Formulating Tailored Technical Questions",
        desc: "Crafting in-depth technical questions with interviewer intentions and recommended answers...",
        badge: "Generating Q&As"
    },
    {
        title: "Developing Behavioral Strategy",
        desc: "Synthesizing scenario-based behavioral questions tailored to your experience level...",
        badge: "Behavioral Prep"
    },
    {
        title: "Structuring Day-by-Day Preparation Roadmap",
        desc: "Organizing targeted focus areas, daily study milestones, and practical action items...",
        badge: "Building Roadmap"
    },
    {
        title: "Finalizing Your Custom Interview Plan",
        desc: "Polishing your complete interview strategy report for maximum readiness...",
        badge: "Finalizing"
    }
]

const TIPS = [
    "Tip: Structure behavioral answers with the STAR method (Situation, Task, Action, Result).",
    "Tip: When answering system design questions, always clarify scale and constraints before designing.",
    "Tip: Focus on business impact—mention metrics, performance gains, and team outcomes whenever possible.",
    "Tip: If you encounter an unfamiliar concept, communicate your thought process and problem-solving strategy aloud.",
    "Tip: Prepare 2 to 3 insightful questions about team culture and technical architecture for your interviewers."
]

const LoadingScreen = ({ isInitialFetch = false }) => {
    const [ stageIndex, setStageIndex ] = useState(0)
    const [ tipIndex, setTipIndex ] = useState(0)
    const [ elapsedSeconds, setElapsedSeconds ] = useState(0)
    const [ progress, setProgress ] = useState(5)

    // Elapsed timer
    useEffect(() => {
        const timer = setInterval(() => {
            setElapsedSeconds(prev => prev + 1)
        }, 1000)
        return () => clearInterval(timer)
    }, [])

    // Smooth stage transitions every ~5 seconds
    useEffect(() => {
        if (isInitialFetch) return

        const stageInterval = setInterval(() => {
            setStageIndex(prev => (prev < STAGES.length - 1 ? prev + 1 : prev))
        }, 4800)

        return () => clearInterval(stageInterval)
    }, [ isInitialFetch ])

    // Tip rotation every ~6 seconds
    useEffect(() => {
        const tipInterval = setInterval(() => {
            setTipIndex(prev => (prev + 1) % TIPS.length)
        }, 5500)

        return () => clearInterval(tipInterval)
    }, [])

    // Smooth progress bar calculation
    useEffect(() => {
        if (isInitialFetch) {
            setProgress(60)
            return
        }

        const progressInterval = setInterval(() => {
            setProgress(prev => {
                // Asymptotically approaches 96% until the API response finishes
                if (prev >= 95) return 95
                const remaining = 95 - prev
                const increment = Math.max(0.4, remaining * 0.05)
                return Math.min(95, prev + increment)
            })
        }, 300)

        return () => clearInterval(progressInterval)
    }, [ isInitialFetch ])

    const currentStage = STAGES[ stageIndex ]

    // Simple, sleek loader if just fetching an existing report from database
    if (isInitialFetch) {
        return (
            <main className='loading-screen-container loading-screen-container--quick'>
                <div className='loading-card loading-card--quick'>
                    <div className='orb-container orb-container--small'>
                        <div className='orb-pulse' />
                        <div className='orb-core'>
                            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff2d78" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 16 14" />
                            </svg>
                        </div>
                    </div>
                    <h2>Loading Interview Report...</h2>
                    <p>Fetching your saved strategy from the database.</p>
                </div>
            </main>
        )
    }

    return (
        <main className='loading-screen-container'>
            <div className='loading-card'>

                {/* Animated AI Core / Orb */}
                <div className='orb-container'>
                    <div className='orb-ring orb-ring--outer' />
                    <div className='orb-ring orb-ring--mid' />
                    <div className='orb-pulse' />
                    <div className='orb-core'>
                        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                        </svg>
                    </div>
                </div>

                {/* Main Heading & Dynamic Badge */}
                <div className='loading-header'>
                    <div className='stage-badge-row'>
                        <span className='stage-live-badge'>
                            <span className='live-dot' />
                            {currentStage.badge}
                        </span>
                        <span className='elapsed-badge'>
                            ⏱ {elapsedSeconds}s elapsed
                        </span>
                    </div>

                    <h1 className='loading-title'>
                        Crafting Your <span className='highlight'>Custom Interview Plan</span>
                    </h1>
                    <p className='loading-subtitle'>
                        Our AI models are deep-analyzing the requirements to formulate your winning preparation strategy.
                    </p>
                </div>

                {/* Progress Bar */}
                <div className='progress-wrapper'>
                    <div className='progress-bar-container'>
                        <div
                            className='progress-bar-fill'
                            style={{ width: `${Math.round(progress)}%` }}
                        />
                    </div>
                    <div className='progress-labels'>
                        <span>{currentStage.title}</span>
                        <span className='progress-percent'>{Math.round(progress)}%</span>
                    </div>
                </div>

                {/* Current Stage Highlight Box */}
                <div className='active-stage-card'>
                    <div className='active-stage-icon'>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ff2d78" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                        </svg>
                    </div>
                    <div className='active-stage-text'>
                        <h3>{currentStage.title}</h3>
                        <p>{currentStage.desc}</p>
                    </div>
                </div>

                {/* Step Pipeline Checklist */}
                <div className='pipeline-steps'>
                    {STAGES.map((stage, idx) => {
                        const isDone = idx < stageIndex
                        const isCurrent = idx === stageIndex

                        return (
                            <div
                                key={idx}
                                className={`pipeline-step ${isDone ? 'pipeline-step--done' : ''} ${isCurrent ? 'pipeline-step--current' : ''}`}
                            >
                                <div className='step-dot'>
                                    {isDone ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                    ) : (
                                        <span>{idx + 1}</span>
                                    )}
                                </div>
                                <span className='step-name'>{stage.badge}</span>
                            </div>
                        )
                    })}
                </div>

                {/* Tip Card Ticker */}
                <div className='tip-container'>
                    <div className='tip-icon'>
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f5a623" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="9" y1="18" x2="15" y2="18" />
                            <line x1="10" y1="22" x2="14" y2="22" />
                            <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
                        </svg>
                    </div>
                    <p className='tip-text' key={tipIndex}>
                        {TIPS[ tipIndex ]}
                    </p>
                </div>

            </div>
        </main>
    )
}

export default LoadingScreen
