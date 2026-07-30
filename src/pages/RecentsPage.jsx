import React from 'react';

const CallLogItem = ({ log }) => (
  <div className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
    <div className={`w-2 h-2 rounded-full ${log.call_type === 'incoming' ? 'bg-green-500' : 'bg-blue-500'}`} />
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium truncate">{log.caller_name || log.caller_extension}</p>
      <p className="text-xs text-gray-400">{new Date(log.created_at).toLocaleString()}</p>
    </div>
    <span className={`text-xs px-2 py-0.5 rounded-full ${log.status === 'completed' ? 'bg-green-100 text-green-700' : log.status === 'missed' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
      {log.status}
    </span>
  </div>
);

const RecentsPage = ({ callLogs }) => (
  <div className="p-4">
    <div className="max-w-4xl mx-auto">
      <h2 className="text-xl font-semibold mb-4 text-gray-200">Recents</h2>
      <div className="space-y-2 overflow-y-auto max-h-96">
        {(!callLogs || callLogs.length === 0) ? (
          <p className="text-sm text-gray-400 text-center py-8">No recent calls</p>
        ) : (
          callLogs.map((log) => (
            <CallLogItem key={log.id} log={log} />
          ))
        )}
      </div>
    </div>
  </div>
);

export default RecentsPage;