import { useState, useEffect } from "react";
import { Phone, Favorite, Contacts, History, Call, AdminPanelSettings, Voicemail, Video } from "lucide-react";
import { getVoicemailUnreadCount } from "../services/voicemail";

const Sidebar = ({ currentPage, onNavigate, darkMode, user }) => {
  const [vmUnread, setVmUnread] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getVoicemailUnreadCount();
        if (data.success) setVmUnread(data.unread_count);
      } catch (e) {}
    };
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { id: "keypad", label: "Keypad", icon: <Phone /> },
    { id: "favorites", label: "Favorites", icon: <Favorite /> },
    { id: "contacts", label: "Contacts", icon: <Contacts /> },
    { id: "calllogs", label: "Call Logs", icon: <History /> },
    { id: "callings", label: "Register", icon: <Call /> },
    { id: "voicemail", label: "Voicemail", icon: <Voicemail />, badge: vmUnread },
    { id: "video", label: "Video Call", icon: <Video /> },
  ];

  if (user?.role === "admin") {
    navItems.push({ id: "admin", label: "Admin Panel", icon: <AdminPanelSettings /> });
  }

  return (
    <div
      className={`hidden md:flex fixed top-0 bottom-0 left-0 w-56 flex-col p-3 overflow-y-auto z-40 ${
        darkMode ? "bg-gray-900" : "bg-white"
      } border-r ${darkMode ? "border-gray-700" : "border-gray-200"} shadow-sm`}
    >
      <h2 className={`text-base font-semibold mb-3 ${darkMode ? "text-white" : "text-gray-900"}`}>
        Dashboard
      </h2>
      <div className="space-y-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
              currentPage === item.id
                ? "bg-blue-600 text-white"
                : darkMode
                ? "text-gray-300 hover:bg-gray-800 hover:text-white"
                : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
            }`}
            aria-label={`Navigate to ${item.label}`}
          >
            {item.icon}
            <span className="text-sm font-medium flex-1 text-left">{item.label}</span>
            {item.badge !== undefined && item.badge > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default Sidebar;
