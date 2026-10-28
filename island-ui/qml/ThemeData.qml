import QtQuick

QtObject {
    id: theme

    property bool isDark: true

    // Surface tokens
    readonly property color surfaceIsland: isDark ? "#191816" : "#F6F2EA"
    readonly property color surfaceRaised: isDark ? "#302D28" : "#EBE5DA"
    readonly property color surfaceHover: isDark ? "#403B34" : "#DDD6C9"

    // Text tokens
    readonly property color textPrimary: isDark ? "#F4F0E9" : "#22201D"
    readonly property color textSecondary: isDark ? "#C8C0B5" : "#575148"
    readonly property color textTertiary: isDark ? "#A69C8F" : "#7A7265"

    // Accent tokens (Warm Minimalist Amber)
    readonly property color accentPrimary: isDark ? "#D8B77F" : "#9E6B25"
    readonly property color accentHover: isDark ? "#E9CEA0" : "#B88339"

    // Border tokens
    readonly property color borderSubtle: isDark ? "#575148" : "#D4CCC0"
    readonly property color borderFocus: isDark ? "#D8B77F" : "#9E6B25"

    // Status tokens
    readonly property color statusSuccess: isDark ? "#9DD2B1" : "#2E7D52"
    readonly property color statusDanger: isDark ? "#F2A3A0" : "#BA3329"
}
