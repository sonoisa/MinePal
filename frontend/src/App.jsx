import { useState, useEffect } from 'react'
import axios from 'axios'
import './App.css'

function App() {
  const [settings, setSettings] = useState({
    minecraft_version: "",
    host: "",
    port: "",
    player_username: "", // Added player username field
    auth: "",
    profiles: [],
    load_memory: false,
    init_message: "",
    allow_insecure_coding: false,
    code_timeout_mins: "",
  })

  const [error, setError] = useState(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [socket, setSocket] = useState(null)
  const [microphone, setMicrophone] = useState(null)
  const [transcription, setTranscription] = useState("")
  const [agentStarted, setAgentStarted] = useState(false)

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await axios.get('/api/settings')
        const expectedFields = Object.keys(settings)
        const filteredSettings = Object.fromEntries(
          Object.entries(response.data).filter(([key]) => expectedFields.includes(key))
        )
        setSettings(prevSettings => ({...prevSettings, ...filteredSettings}))
      } catch (err) {
        console.error("Failed to fetch settings:", err)
        setError("Failed to load settings. Is main.js running?")
      }
    }

    fetchSettings()
  }, [])

  const settingNotes = {
    minecraft_version: "supports up to 1.20.4",
    host: "or \"localhost\", \"your.ip.address.here\"",
    port: "default is 25565",
    player_username: "your Minecraft username",
    auth: "or \"microsoft\"",
    profiles: "add more profiles here, check ./profiles/ for more. More than 1 profile will require you to /msg each bot individually",
    load_memory: "load memory from previous session",
    init_message: "sends to all on spawn",
    allow_insecure_coding: "disable at own risk",
    code_timeout_mins: "-1 for no timeout",
  }

  const handleSettingChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  const startAgent = async () => {
    try {
      const response = await axios.post('/api/start', settings);
      console.log("Agent started successfully:", response.data);
      setAgentStarted(true);
    } catch (error) {
      console.error("Failed to start agent:", error);
      setError(error.response?.data || error.message || "An unknown error occurred while starting the agent.");
    }
  }

  const getMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return new MediaRecorder(stream);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      throw error;
    }
  }

  const openMicrophone = async (mic, sock) => {
    return new Promise((resolve) => {
      mic.onstart = () => {
        console.log("Microphone started");
        setIsRecording(true);
        resolve();
      };

      mic.onstop = () => {
        console.log("Microphone stopped");
        setIsRecording(false);
      };

      mic.ondataavailable = (event) => {
        if (event.data.size > 0 && sock.readyState === WebSocket.OPEN) {
          sock.send(event.data);
        }
      };

      mic.start(1000);
    });
  }

  const closeMicrophone = async (mic) => {
    if (mic && mic.state !== "inactive") {
      mic.stop();
    }
  }

  const toggleMic = async () => {
    if (!agentStarted) {
      setError("Please start the agent first.");
      return;
    }

    if (isRecording) {
      await closeMicrophone(microphone);
      if (socket) {
        socket.close();
        setSocket(null);
      }
      setMicrophone(null);
      setIsRecording(false);
    } else {
      const newSocket = new WebSocket("ws://localhost:3000");
      setSocket(newSocket);

      newSocket.addEventListener("open", async () => {
        console.log("WebSocket connection opened");
        try {
          const mic = await getMicrophone();
          setMicrophone(mic);
          await openMicrophone(mic, newSocket);
        } catch (error) {
          console.error("Error opening microphone:", error);
          setError("Failed to start recording. Please check your microphone permissions.");
        }
      });
      
      newSocket.addEventListener("message", (event) => {
        const data = JSON.parse(event.data);
        if (data.channel.alternatives[0].transcript !== "") {
          setTranscription(data.channel.alternatives[0].transcript);
        }
      });

      newSocket.addEventListener("close", () => {
        console.log("WebSocket connection closed");
        setIsRecording(false);
      });
    }
  }

  return (
    <div className="container">
      <h1>Minepal Control Panel</h1>
      <div className="settings">
        {Object.entries(settings).map(([key, value]) => {
          if (key !== 'load_memory' && key !== 'allow_insecure_coding' && key !== 'code_timeout_mins') {
            if (key === 'host' || key === 'port' || key === 'player_username') {
              return (
                <div key={key} className="setting-item inline">
                  <label htmlFor={key}>
                    {key.replace(/_/g, ' ')}:
                    {settingNotes[key] && <span className="setting-note"> ({settingNotes[key]})</span>}
                  </label>
                  <input
                    id={key}
                    type={key === 'port' ? 'number' : 'text'}
                    value={value}
                    onChange={(e) => handleSettingChange(key, e.target.value)}
                  />
                </div>
              )
            } else {
              return (
                <div key={key} className="setting-item">
                  <label htmlFor={key}>
                    {key.replace(/_/g, ' ')}:
                    {settingNotes[key] && <span className="setting-note"> ({settingNotes[key]})</span>}
                  </label>
                  {typeof value === 'boolean' ? (
                    <label className="switch">
                      <input
                        type="checkbox"
                        id={key}
                        checked={value}
                        onChange={(e) => handleSettingChange(key, e.target.checked)}
                      />
                      <span className="slider"></span>
                    </label>
                  ) : Array.isArray(value) ? (
                    <input
                      id={key}
                      type="text"
                      value={value.join(', ')}
                      onChange={(e) => handleSettingChange(key, e.target.value.split(', '))}
                    />
                  ) : (
                    <input
                      id={key}
                      type={key === 'port' || key === 'code_timeout_mins' ? 'number' : 'text'}
                      value={value}
                      onChange={(e) => handleSettingChange(key, e.target.value)}
                    />
                  )}
                </div>
              )
            }
          }
          return null;
        })}
        <div className="advanced-settings">
          <button onClick={() => setShowAdvanced(!showAdvanced)}>
            {showAdvanced ? 'Hide Advanced Settings' : 'Show Advanced Settings'}
          </button>
          {showAdvanced && (
            <div className="advanced-settings-content">
              {['load_memory', 'allow_insecure_coding', 'code_timeout_mins'].map(key => (
                <div key={key} className="setting-item">
                  <label htmlFor={key}>
                    {key.replace(/_/g, ' ')}:
                    {settingNotes[key] && <span className="setting-note"> ({settingNotes[key]})</span>}
                  </label>
                  {typeof settings[key] === 'boolean' ? (
                    <label className="switch">
                      <input
                        type="checkbox"
                        id={key}
                        checked={settings[key]}
                        onChange={(e) => handleSettingChange(key, e.target.checked)}
                      />
                      <span className="slider"></span>
                    </label>
                  ) : (
                    <input
                      id={key}
                      type={key === 'code_timeout_mins' ? 'number' : 'text'}
                      value={settings[key]}
                      onChange={(e) => handleSettingChange(key, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="actions">
        <button className="action-button" onClick={startAgent}>Start Agent</button>
        <button className="action-button" onClick={toggleMic}>
          {isRecording ? 'Voice Off' : 'Voice On'}
        </button>
      </div>
      {error && <div className="error-message">{error}</div>}
      <div className="transcription-box">
        <label htmlFor="transcription">Transcription:</label>
        <span>{transcription}</span>
      </div>
    </div>
  )
}

export default App
