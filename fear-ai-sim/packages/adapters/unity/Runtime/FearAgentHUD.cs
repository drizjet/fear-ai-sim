using UnityEngine;

namespace FearAI.Unity
{
    /// <summary>
    /// Reusable IMGUI/Screen-space HUD for Fear AI agents in Unity.
    /// Renders color-coded fear meter, action intent badge, and heartbeat BPM.
    /// </summary>
    [RequireComponent(typeof(FearAgent))]
    public class FearAgentHUD : MonoBehaviour
    {
        [Header("Display Settings")]
        public float verticalOffset = 2.0f;
        public float barWidth = 80.0f;
        public float barHeight = 8.0f;
        public bool showIntentBadge = true;
        public bool showHeartbeat = true;

        private FearAgent _agent;
        private GUIStyle _badgeStyle;
        private GUIStyle _bpmStyle;
        private Texture2D _bgTexture;
        private Texture2D _fillTexture;

        private void Awake()
        {
            _agent = GetComponent<FearAgent>();
            _bgTexture = MakeTexture(1, 1, new Color(0.1f, 0.12f, 0.18f, 0.85f));
            _fillTexture = MakeTexture(1, 1, Color.white);
        }

        private void OnGUI()
        {
            if (_agent == null || Camera.main == null) return;

            Vector3 worldPos = transform.position + Vector3.up * verticalOffset;
            Vector3 screenPos = Camera.main.WorldToScreenPoint(worldPos);

            // Clip behind camera
            if (screenPos.z < 0) return;

            float x = screenPos.x - barWidth * 0.5f;
            float y = Screen.height - screenPos.y;

            // 1. Background
            GUI.color = Color.white;
            GUI.DrawTexture(new Rect(x, y, barWidth, barHeight), _bgTexture);

            // 2. Filled Bar
            float fear01 = Mathf.Clamp01(_agent.currentFear);
            Color barColor = GetBandColor(_agent.currentFearBand);
            GUI.color = barColor;
            GUI.DrawTexture(new Rect(x, y, barWidth * fear01, barHeight), _fillTexture);
            GUI.color = Color.white;

            // 3. Intent Badge
            if (showIntentBadge)
            {
                if (_badgeStyle == null)
                {
                    _badgeStyle = new GUIStyle(GUI.skin.label)
                    {
                        alignment = TextAnchor.MiddleCenter,
                        fontSize = 11,
                        fontStyle = FontStyle.Bold
                    };
                }
                _badgeStyle.normal.textColor = barColor;
                string badge = $"[{_agent.currentIntent}]";
                GUI.Label(new Rect(screenPos.x - 100, y - 18, 200, 16), badge, _badgeStyle);
            }

            // 4. Heartbeat BPM
            if (showHeartbeat)
            {
                if (_bpmStyle == null)
                {
                    _bpmStyle = new GUIStyle(GUI.skin.label)
                    {
                        alignment = TextAnchor.MiddleCenter,
                        fontSize = 10
                    };
                }
                _bpmStyle.normal.textColor = _agent.currentHeartbeatBpm > 100 ? new Color(1f, 0.35f, 0.35f) : new Color(0.7f, 0.75f, 0.85f);
                string bpm = $"♥ {_agent.currentHeartbeatBpm} BPM";
                GUI.Label(new Rect(screenPos.x - 100, y + barHeight + 2, 200, 16), bpm, _bpmStyle);
            }
        }

        private Color GetBandColor(string band)
        {
            switch (band)
            {
                case "CALM": return new Color(0.06f, 0.72f, 0.51f);
                case "UNEASY": return new Color(0.52f, 0.80f, 0.09f);
                case "ANXIOUS": return new Color(0.96f, 0.62f, 0.04f);
                case "FEAR": return new Color(0.98f, 0.45f, 0.09f);
                case "PANIC": return new Color(0.94f, 0.27f, 0.27f);
                default: return Color.green;
            }
        }

        private Texture2D MakeTexture(int width, int height, Color color)
        {
            Color[] pix = new Color[width * height];
            for (int i = 0; i < pix.Length; i++) pix[i] = color;
            Texture2D result = new Texture2D(width, height);
            result.SetPixels(pix);
            result.Apply();
            return result;
        }
    }
}
