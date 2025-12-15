
import React from 'react';

interface MarkdownTextProps {
  content: string;
}

const MarkdownText: React.FC<MarkdownTextProps> = ({ content }) => {
  const lines = content.split('\n');
  const renderedContent: React.ReactNode[] = [];
  let inNumberedList = false;
  let inBulletList = false;

  lines.forEach((line, index) => {
    const trimmedLine = line.trim();

    // Helper to process bold text within a string (handles **text**)
    const processBold = (text: string): React.ReactNode[] => {
      const parts: React.ReactNode[] = [];
      const regex = /\*\*(.*?)\*\*/g; 
      let lastIndex = 0;
      let match;
      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          parts.push(text.substring(lastIndex, match.index));
        }
        parts.push(<strong key={`bold-${index}-${match.index}`}>{match[1]}</strong>);
        lastIndex = regex.lastIndex;
      }
      if (lastIndex < text.length) {
        parts.push(text.substring(lastIndex));
      }
      return parts;
    };

    // Check for numbered list item (e.g., 1. Text)
    if (trimmedLine.match(/^\d+\.\s/)) {
      if (!inNumberedList) {
        renderedContent.push(<ol key={`ol-start-${index}`} className="list-decimal list-inside pl-0 text-slate-300 text-sm leading-relaxed mb-2" />);
        inNumberedList = true;
        inBulletList = false;
      }
      renderedContent.push(
        <li key={`li-num-${index}`} className="ml-4"> {/* Indent list items */}
          {processBold(trimmedLine.replace(/^\d+\.\s/, ''))}
        </li>
      );
    }
    // Check for bullet list item (e.g., * Text)
    else if (trimmedLine.startsWith('* ')) {
      if (!inBulletList) {
        renderedContent.push(<ul key={`ul-start-${index}`} className="list-disc list-inside pl-0 text-slate-300 text-sm leading-relaxed mb-2" />);
        inBulletList = true;
        inNumberedList = false;
      }
      renderedContent.push(
        <li key={`li-bullet-${index}`} className="ml-4"> {/* Indent list items */}
          {processBold(trimmedLine.replace(/^\*\s/, ''))}
        </li>
      );
    }
    // Handle other lines
    else {
      // Close any open lists before rendering non-list content
      if (inNumberedList) {
        renderedContent.push(<ol key={`ol-end-${index}`} />);
        inNumberedList = false;
      }
      if (inBulletList) {
        renderedContent.push(<ul key={`ul-end-${index}`} />);
        inBulletList = false;
      }

      // Render as paragraph or just content
      if (trimmedLine.length > 0) {
        renderedContent.push(
          <p key={`p-${index}`} className="text-sm leading-relaxed mb-2">
            {processBold(trimmedLine)}
          </p>
        );
      } else {
        // Preserve empty lines for spacing
        renderedContent.push(<br key={`br-${index}`} />);
      }
    }
  });

  // Ensure any open lists are closed at the very end
  if (inNumberedList) {
    renderedContent.push(<ol key={`final-ol-end`} />);
  }
  if (inBulletList) {
    renderedContent.push(<ul key={`final-ul-end`} />);
  }

  return <>{renderedContent}</>;
};

export default MarkdownText;
