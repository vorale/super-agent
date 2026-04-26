/**
 * Support Analytics Page
 * Dashboard with core metrics cards and summary data.
 */

import { useState, useEffect } from 'react'
import { BarChart3, MessageSquare, Bot, Clock, Star } from 'lucide-react'
import { RestSupportService, type MetricsSummary } from '@/services/api/restSupportService'
import { useTranslation } from '@/i18n'

export function SupportAnalytics() {
  const { t } = useTranslation()
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadMetrics()
  }, [])

  const loadMetrics = async () => {
    try {
      const data = await RestSupportService.getMetricsSummary()
      setMetrics(data)
    } catch (err) {
      console.error('Failed to load metrics:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Loading analytics...</div>
  }

  const cards = metrics ? [
    {
      title: 'Total Conversations',
      value: metrics.totalConversations.toString(),
      subtitle: 'Last 30 days',
      icon: <MessageSquare className="w-6 h-6" />,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
    },
    {
      title: 'AI Resolved Rate',
      value: `${(metrics.aiResolvedRate * 100).toFixed(1)}%`,
      subtitle: `${metrics.resolvedConversations} resolved`,
      icon: <Bot className="w-6 h-6" />,
      color: 'text-green-400',
      bg: 'bg-green-500/10',
    },
    {
      title: 'Avg CSAT Rating',
      value: metrics.avgCsatRating > 0 ? metrics.avgCsatRating.toFixed(1) : 'N/A',
      subtitle: `${metrics.csatCount} surveys`,
      icon: <Star className="w-6 h-6" />,
      color: 'text-yellow-400',
      bg: 'bg-yellow-500/10',
    },
    {
      title: 'Avg First Response',
      value: metrics.avgFirstResponseSec != null
        ? metrics.avgFirstResponseSec < 60
          ? `${Math.round(metrics.avgFirstResponseSec)}s`
          : `${(metrics.avgFirstResponseSec / 60).toFixed(1)}m`
        : 'N/A',
      subtitle: 'Time to first reply',
      icon: <Clock className="w-6 h-6" />,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
    },
  ] : []

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <BarChart3 className="w-6 h-6 text-blue-400" />
        <h1 className="text-2xl font-bold">{t('support.analytics')}</h1>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card, i) => (
          <div key={i} className="bg-white/5 rounded-xl p-5 border border-white/10">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-400">{card.title}</span>
              <div className={`p-2 rounded-lg ${card.bg}`}>
                <span className={card.color}>{card.icon}</span>
              </div>
            </div>
            <div className="text-3xl font-bold mb-1">{card.value}</div>
            <div className="text-xs text-gray-500">{card.subtitle}</div>
          </div>
        ))}
      </div>

      {/* Placeholder for charts */}
      <div className="bg-white/5 rounded-xl p-6 border border-white/10">
        <h2 className="text-lg font-semibold mb-4">Trends</h2>
        <div className="h-64 flex items-center justify-center text-gray-500">
          <p>Chart visualization will be available with more data</p>
        </div>
      </div>
    </div>
  )
}
