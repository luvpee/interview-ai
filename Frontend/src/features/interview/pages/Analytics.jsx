import { useEffect, useState } from 'react'
import '../style/analytics.scss'
import { Link } from 'react-router'
import { getAnalytics } from '../services/interview.api'

const LineChart = ({ trend }) => {
    if (trend.length === 0) {
        return <p className='analytics-empty'>No reports yet - generate an interview plan to see your trend.</p>
    }

    const width = 400
    const height = 160
    const paddingX = 24
    const paddingY = 20
    const innerWidth = width - paddingX * 2
    const innerHeight = height - paddingY * 2

    const points = trend.map((point, i) => {
        const x = trend.length === 1 ? paddingX + innerWidth / 2 : paddingX + (i / (trend.length - 1)) * innerWidth
        const y = paddingY + innerHeight - (point.matchScore / 100) * innerHeight
        return { x, y, ...point }
    })

    const polylinePoints = points.map(p => `${p.x},${p.y}`).join(' ')

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className='trend-chart'>
            <line x1={paddingX} y1={paddingY + innerHeight} x2={width - paddingX} y2={paddingY + innerHeight} className='trend-chart__axis' />
            <polyline points={polylinePoints} className='trend-chart__line' fill='none' />
            {points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3} className='trend-chart__dot'>
                    <title>{`${new Date(p.date).toLocaleDateString()}: ${p.matchScore}%`}</title>
                </circle>
            ))}
        </svg>
    )
}

const Analytics = () => {
    const [ data, setData ] = useState(null)
    const [ loading, setLoading ] = useState(true)
    const [ error, setError ] = useState("")

    useEffect(() => {
        (async () => {
            try {
                const response = await getAnalytics()
                setData(response)
            } catch (err) {
                setError(err?.response?.data?.message || "Failed to load analytics.")
            } finally {
                setLoading(false)
            }
        })()
    }, [])

    return (
        <div className='analytics-page'>
            <header className='analytics-header'>
                <h1>Your <span className='highlight'>Analytics</span></h1>
                <Link to='/'>Back to Home</Link>
            </header>

            {loading && <p className='analytics-empty'>Loading analytics...</p>}
            {error && <p className='form-error'>{error}</p>}

            {data && (
                <div className='analytics-body'>
                    <section className='analytics-card'>
                        <h2>Match Score Trend</h2>
                        <LineChart trend={data.matchScoreTrend} />
                    </section>

                    <section className='analytics-card'>
                        <h2>Most Frequent Skill Gaps</h2>
                        {data.topSkillGaps.length === 0 ? (
                            <p className='analytics-empty'>No skill gaps recorded yet.</p>
                        ) : (
                            <ul className='skill-gap-bars'>
                                {data.topSkillGaps.map((item) => (
                                    <li key={item.skill}>
                                        <span className='skill-gap-bars__label'>{item.skill}</span>
                                        <div className='skill-gap-bars__track'>
                                            <div
                                                className='skill-gap-bars__fill'
                                                style={{ width: `${(item.count / data.topSkillGaps[ 0 ].count) * 100}%` }}
                                            />
                                        </div>
                                        <span className='skill-gap-bars__count'>{item.count}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            )}
        </div>
    )
}

export default Analytics
