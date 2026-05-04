window.safeMarkdownToReact = function(text) {
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, i) => {
        if (part.startsWith('```') && part.endsWith('```')) {
            const code = part.replace(/^```\w*\n?/, '').replace(/```$/, '');
            return React.createElement('div', { key: i, className: 'relative mt-2 mb-2' },
                React.createElement('div', { className: 'absolute top-0 right-0 bg-zinc-800 text-[10px] px-2 py-1 rounded-bl text-zinc-400' }, 'Code'),
                React.createElement('pre', { className: 'bg-zinc-950 p-3 pt-6 rounded overflow-x-auto text-amber-400 text-xs border border-zinc-800' },
                    React.createElement('code', null, code)
                )
            );
        } else {
            const elements = [];
            const tokenRegex = /(\*\*(.*?)\*\*|\*(.*?)\*|`(.*?)`|\[(.*?)\]\((.*?)\))/g;
            let lastIndex = 0;
            let match;
            while ((match = tokenRegex.exec(part)) !== null) {
                if (lastIndex < match.index) {
                    elements.push(part.substring(lastIndex, match.index));
                }
                if (match[2]) {
                    elements.push(React.createElement('strong', { key: i + '-' + lastIndex }, match[2]));
                } else if (match[3]) {
                    elements.push(React.createElement('em', { key: i + '-' + lastIndex }, match[3]));
                } else if (match[4]) {
                    elements.push(React.createElement('code', { key: i + '-' + lastIndex, className: 'bg-zinc-800 px-1 rounded text-amber-300 text-sm' }, match[4]));
                } else if (match[5]) {
                    elements.push(React.createElement('a', { key: i + '-' + lastIndex, href: match[6], target: '_blank', rel: 'noopener noreferrer', className: 'text-blue-400 underline' }, match[5]));
                }
                lastIndex = tokenRegex.lastIndex;
            }
            if (lastIndex < part.length) {
                elements.push(part.substring(lastIndex));
            }
            return React.createElement('span', { key: i }, elements);
        }
    });
};
