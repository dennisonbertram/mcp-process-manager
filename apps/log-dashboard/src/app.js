import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
function useSSE(url) {
    const [lines, setLines] = useState([]);
    const [connected, setConnected] = useState(false);
    const esRef = useRef(null);
    useEffect(() => {
        if (!url)
            return;
        const es = new EventSource(url);
        esRef.current = es;
        setConnected(true);
        es.onmessage = (e) => {
            try {
                const entry = JSON.parse(e.data);
                const text = `[${new Date(entry.timestamp).toLocaleTimeString()}] ${String(entry.level).toUpperCase()} ${entry.message}`;
                setLines(prev => prev.length > 2000 ? [...prev.slice(-1500), text] : [...prev, text]);
            }
            catch { }
        };
        es.onerror = () => setConnected(false);
        return () => { es.close(); setConnected(false); };
    }, [url]);
    return { lines, connected };
}
export default function App() {
    const [processes, setProcesses] = useState([]);
    const [pid, setPid] = useState(null);
    const { lines, connected } = useSSE(pid ? `/api/logs?processId=${encodeURIComponent(pid)}` : null);
    const current = useMemo(() => processes.find(p => p.id === pid) || null, [processes, pid]);
    useEffect(() => {
        const tick = async () => {
            try {
                const r = await fetch('/api/processes');
                const d = await r.json();
                setProcesses(d.processes || []);
                if (!pid && d.processes?.length)
                    setPid(d.processes[0].id);
            }
            catch { }
        };
        tick();
        const h = setInterval(tick, 3000);
        return () => clearInterval(h);
    }, [pid]);
    return (_jsxs("div", { className: "grid grid-cols-[260px_1fr] h-screen", children: [_jsxs("aside", { className: "border-r border-gray-200 p-3 overflow-auto", children: [_jsx("h1", { className: "text-sm font-medium text-gray-900 mb-2", children: "Processes" }), _jsx("div", { className: "space-y-1", children: processes.map((p) => (_jsxs("button", { onClick: () => setPid(p.id), className: `w-full text-left px-2 py-1 rounded border ${p.id === pid ? 'bg-gray-100 border-gray-300' : 'border-transparent hover:bg-gray-50'}`, children: [_jsx("span", { className: `inline-block w-2 h-2 rounded-full mr-2 ${p.status === 'running' ? 'bg-emerald-500' : p.status === 'stopped' ? 'bg-gray-400' : 'bg-red-500'}` }), p.name, " ", _jsxs("span", { className: "text-xs text-gray-500", children: ["(", p.id.slice(0, 6), ")"] })] }, p.id))) })] }), _jsxs("main", { className: "p-3 flex flex-col h-screen", children: [_jsxs("div", { className: "flex items-center gap-2 mb-2", children: [_jsx("div", { className: "text-sm text-gray-700", children: current ? `Viewing ${current.name} (${current.id.slice(0, 6)})` : 'Select a process' }), _jsx("div", { className: `text-xs px-2 py-0.5 rounded ${connected ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'}`, children: connected ? 'connected' : 'disconnected' })] }), _jsx("pre", { id: "logs", className: "whitespace-pre-wrap bg-[#0b1020] text-gray-200 p-2 rounded flex-1 overflow-auto text-xs", children: lines.join('\n') })] })] }));
}
