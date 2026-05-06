import { Brain, Lightbulb, Link2, ChevronRight } from 'lucide-react'
import { useTranslation } from '@/i18n'
import type { ChatContext } from '@/types'

interface ContextPanelProps {
  context: ChatContext | null
  isLoading?: boolean
}

function SectionHeader({ icon: Icon, title }: { icon: typeof Brain; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-gray-400" />
      <h3 className="text-sm font-medium text-gray-300">{title}</h3>
    </div>
  )
}

function MemoryItem({ content }: { content: string }) {
  return (
    <div className="px-3 py-2 bg-gray-800/50 rounded-lg text-sm text-gray-400 border border-gray-700/50">
      {content}
    </div>
  )
}

function UseCaseItem({ title, description }: { title: string; description: string }) {
  return (
    <div className="px-3 py-2 bg-gray-800/50 rounded-lg border border-gray-700/50 hover:border-blue-500/50 transition-colors cursor-pointer">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-200">{title}</span>
        <ChevronRight className="w-4 h-4 text-gray-500" />
      </div>
      <p className="text-xs text-gray-500 mt-1">{description}</p>
    </div>
  )
}

function LinkItem({ title, url }: { title: string; url: string }) {
  return (
    <a
      href={url}
      className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 rounded-lg border border-gray-700/50 hover:border-blue-500/50 transition-colors group"
    >
      <Link2 className="w-4 h-4 text-gray-500 group-hover:text-blue-400" />
      <span className="text-sm text-gray-300 group-hover:text-blue-400">{title}</span>
    </a>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-4 w-24 bg-gray-700 rounded mb-3" />
        <div className="space-y-2">
          <div className="h-10 bg-gray-800 rounded-lg" />
          <div className="h-10 bg-gray-800 rounded-lg" />
        </div>
      </div>
      <div>
        <div className="h-4 w-24 bg-gray-700 rounded mb-3" />
        <div className="space-y-2">
          <div className="h-14 bg-gray-800 rounded-lg" />
          <div className="h-14 bg-gray-800 rounded-lg" />
        </div>
      </div>
    </div>
  )
}

export function ContextPanel({ context, isLoading = false }: ContextPanelProps) {
  const { t } = useTranslation()

  if (isLoading) {
    return (
      <div className="w-72 bg-gray-900 border-l border-gray-800 p-4 overflow-y-auto">
        <LoadingSkeleton />
      </div>
    )
  }

  if (!context) {
    return (
      <div className="w-72 bg-gray-900 border-l border-gray-800 p-4 flex items-center justify-center">
        <p className="text-gray-500 text-sm text-center">{t('chat.noContext')}</p>
      </div>
    )
  }

  return (
    <div className="w-72 bg-gray-900 border-l border-gray-800 p-4 overflow-y-auto">
      <div className="space-y-6">
        {/* Memories Section */}
        {(context.memories?.length ?? 0) > 0 && (
          <div>
            <SectionHeader icon={Brain} title={t('chat.memories')} />
            <div className="space-y-2">
              {context.memories.map((memory) => (
                <MemoryItem key={memory.id} content={memory.content} />
              ))}
            </div>
          </div>
        )}

        {/* Use Cases Section */}
        {(context.useCases?.length ?? 0) > 0 && (
          <div>
            <SectionHeader icon={Lightbulb} title={t('chat.useCases')} />
            <div className="space-y-2">
              {context.useCases.map((useCase) => (
                <UseCaseItem
                  key={useCase.id}
                  title={useCase.title}
                  description={useCase.description}
                />
              ))}
            </div>
          </div>
        )}

        {/* Related Links Section */}
        {(context.relatedLinks?.length ?? 0) > 0 && (
          <div>
            <SectionHeader icon={Link2} title={t('chat.relatedLinks')} />
            <div className="space-y-2">
              {context.relatedLinks.map((link) => (
                <LinkItem key={link.id} title={link.title} url={link.url} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
