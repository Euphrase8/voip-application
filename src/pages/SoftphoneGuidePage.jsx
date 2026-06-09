import { useState } from "react";
import { Smartphone, Download, CheckCircle, Wifi, Settings } from "lucide-react";
import { FiCopy, FiCheck } from "react-icons/fi";
import { cn } from "../utils/ui";

const softphones = [
  {
    id: "zoiper",
    name: "Zoiper",
    platforms: ["Android", "iOS", "Windows", "macOS", "Linux"],
    downloadUrl: "https://www.zoiper.com",
    setup: [
      { title: "Download & Install", text: "Download Zoiper from the official website or app store for your device." },
      { title: "Create SIP Account", text: "Open Zoiper → Settings → Accounts → Add Account → SIP Account." },
      { title: "Account Settings", text: "Account Name: VoIP System\nUsername: YOUR_EXTENSION (e.g. 1001)\nPassword: Your SIP password\nDomain: Asterisk server IP or hostname" },
      { title: "Server Settings", text: "Proxy: Same as domain\nOutbound Proxy: (leave empty)\nTransport: UDP (or TCP if needed)" },
      { title: "Advanced Settings", text: "Enable STUN: Yes\nSTUN Server: stun.l.google.com:19302\nEnable ICE: Yes\nEnable SRTP: (optional, if configured)" },
      { title: "Verify", text: "After saving, Zoiper should register. Look for a green status indicator." },
    ],
  },
  {
    id: "linphone",
    name: "Linphone",
    platforms: ["Android", "iOS", "Windows", "macOS", "Linux"],
    downloadUrl: "https://www.linphone.org",
    setup: [
      { title: "Download & Install", text: "Get Linphone from linphone.org or your device's app store." },
      { title: "Add SIP Account", text: "Open Linphone → Settings → Add Account → SIP Account." },
      { title: "Account Configuration", text: "Username: YOUR_EXTENSION\nPassword: Your SIP password\nDomain: Asterisk server IP\nTransport: UDP (default)" },
      { title: "Network Settings", text: "Enable: Use IPv6 (if needed)\nNAT traversal: STUN\nSTUN: stun.l.google.com:19302\nEnable ICE where available" },
      { title: "Audio Settings", text: "Codecs: Enable PCMU/PCMA, G.722 (wideband)\nDisable unused codecs for better quality\nEcho Cancellation: ON" },
      { title: "Verify Registration", text: "The account status should show 'Registered' (green).\nMake a test call to extension 1000 to verify." },
    ],
  },
  {
    id: "microsip",
    name: "MicroSIP",
    platforms: ["Windows only"],
    downloadUrl: "https://www.microsip.org",
    setup: [
      { title: "Download & Install", text: "Download MicroSIP from microsip.org and install on Windows." },
      { title: "Account Settings", text: "Open MicroSIP → Menu → SIP Account Settings.\n\nAccount Name: YOUR_EXTENSION\nServer: Asterisk server IP:5060\nUsername: YOUR_EXTENSION\nPassword: Your SIP password" },
      { title: "Network Settings", text: "Transport: UDP (default)\nEnable: Use STUN\nSTUN: stun.l.google.com:19302\nEnable ICE if behind NAT" },
      { title: "Audio & Codecs", text: "Go to Menu → Options → Audio\nSelect your microphone and speaker\nEnable echo cancellation\nCodec priority: PCMU, PCMA, G.722" },
      { title: "Save & Connect", text: "Click OK to save. The status bar should show 'Ready' or 'Registered' in green." },
      { title: "Test Call", text: "Dial extension 1000 (admin) or another user's extension to test." },
    ],
  },
];

const SoftphoneGuidePage = ({ darkMode }) => {
  const [activeSoftphone, setActiveSoftphone] = useState("zoiper");
  const [copied, setCopied] = useState(false);

  const active = softphones.find((s) => s.id === activeSoftphone);

  const copyExtensionInfo = async () => {
    const ext = localStorage.getItem("extension") || "your_extension";
    const text = `SIP Configuration:\nExtension: ${ext}\nServer: ${window.location.hostname || "asterisk-server-ip"}\nTransport: UDP\nSTUN: stun.l.google.com:19302`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className={cn("h-full flex flex-col", darkMode ? "text-white" : "text-gray-900")}>
      <div className={cn(
        "flex-shrink-0 border-b p-4",
        darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
      )}>
        <div className="flex items-center gap-2 mb-3">
          <Smartphone className="w-5 h-5" />
          <h2 className="font-semibold">Mobile Softphone Setup</h2>
        </div>
        <p className={cn("text-sm", darkMode ? "text-gray-400" : "text-gray-500")}>
          Configure your SIP softphone to connect to the VoIP system
        </p>
      </div>

      <div className={cn(
        "flex-shrink-0 border-b px-4",
        darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
      )}>
        <div className="flex gap-2 py-2 overflow-x-auto">
          {softphones.map((sp) => (
            <button
              key={sp.id}
              onClick={() => setActiveSoftphone(sp.id)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
                activeSoftphone === sp.id
                  ? "bg-blue-500 text-white"
                  : darkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
              )}
            >
              {sp.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {active && (
          <div className="space-y-4">
            <div className={cn(
              "p-4 rounded-xl",
              darkMode ? "bg-gray-800" : "bg-gray-50"
            )}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-lg">{active.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    {active.platforms.map((p) => (
                      <span key={p} className={cn(
                        "text-xs px-2 py-0.5 rounded-full",
                        darkMode ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-600"
                      )}>{p}</span>
                    ))}
                  </div>
                </div>
                <a
                  href={active.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm bg-blue-500 text-white px-3 py-2 rounded-lg hover:bg-blue-600 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download
                </a>
              </div>

              <div className={cn(
                "p-3 rounded-lg mb-3 flex items-center justify-between",
                darkMode ? "bg-gray-700" : "bg-blue-50"
              )}>
                <div className="flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-blue-500" />
                  <span className="text-sm">
                    Extension: <strong>{localStorage.getItem("extension") || "your_extension"}</strong>
                  </span>
                </div>
                <button
                  onClick={copyExtensionInfo}
                  className={cn(
                    "flex items-center gap-1 text-sm px-2 py-1 rounded transition-colors",
                    copied ? "text-green-500" : darkMode ? "hover:bg-gray-600" : "hover:bg-blue-100"
                  )}
                >
                  {copied ? <FiCheck className="w-4 h-4" /> : <FiCopy className="w-4 h-4" />}
                  {copied ? "Copied" : "Copy config"}
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {active.setup.map((step, idx) => (
                <div key={idx} className={cn(
                  "p-4 rounded-xl",
                  darkMode ? "bg-gray-800" : "bg-white shadow-sm"
                )}>
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold",
                      darkMode ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-600"
                    )}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm mb-1">{step.title}</h4>
                      <p className={cn(
                        "text-sm whitespace-pre-line",
                        darkMode ? "text-gray-400" : "text-gray-600"
                      )}>{step.text}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className={cn(
              "p-4 rounded-xl flex items-start gap-3",
              darkMode ? "bg-green-900/20 border border-green-800" : "bg-green-50 border border-green-200"
            )}>
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm text-green-700 dark:text-green-400">Setup Complete</p>
                <p className={cn(
                  "text-sm mt-1",
                  darkMode ? "text-green-300" : "text-green-600"
                )}>
                  Once registered, you can make and receive calls from this softphone.
                  Your extension will ring on both the web app and the softphone simultaneously.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SoftphoneGuidePage;
