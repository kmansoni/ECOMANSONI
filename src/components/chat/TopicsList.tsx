import React from 'react';
import { motion } from 'framer-motion';
import { Plus, Lock } from 'lucide-react';
import { GroupTopic } from '@/hooks/useGroupTopics';

interface TopicsListProps {
  topics: GroupTopic[];
  activeTopic: string | null;
  onSelectTopic: (topicId: string) => void;
  onCreateTopic?: () => void;
  canCreate?: boolean;
}

export const TopicsList: React.FC<TopicsListProps> = ({
  topics,
  activeTopic,
  onSelectTopic,
  onCreateTopic,
  canCreate = false,
}) => {
  return (
    <div className="flex items-center gap-1 px-3 py-2 overflow-x-auto scrollbar-hide bg-[#1a1a2e] border-b border-white/10">
      {topics.map(topic => {
        const isActive = activeTopic === topic.id;
        const baseClass = 'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap relative transition-all duration-200 flex-shrink-0';
        const activeClass = isActive ? 'text-white bg-white/15' : 'text-white/60 hover:text-white/80';
        return (
          <motion.button
            key={topic.id}
            onClick={() => onSelectTopic(topic.id)}
            whileTap={{ scale: 0.95 }}
            className={baseClass + ' ' + activeClass}
            style={isActive ? { boxShadow: '0 2px 0 0 ' + topic.icon_color } : undefined}
          >
            <span className="text-base leading-none">{topic.icon_emoji}</span>
            <span className="max-w-[120px] truncate">{topic.name}</span>
            {topic.is_closed && (
              <Lock size={11} className="text-white/40 flex-shrink-0" />
            )}
            {(topic.unread_count ?? 0) > 0 && (
              <span className="ml-0.5 bg-blue-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                {topic.unread_count}
              </span>
            )}
          </motion.button>
        );
      })}

      {canCreate && (
        <motion.button
          onClick={onCreateTopic}
          whileTap={{ scale: 0.9 }}
          className="flex items-center justify-center w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex-shrink-0 ml-1"
        >
          <Plus size={14} className="text-white/70" />
        </motion.button>
      )}
    </div>
  );
};
