import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ApplicationWindow {
    id: root
    visible: true
    width: 520
    height: 640
    title: "Linux Island Settings"
    color: "#191816"

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 24
        spacing: 16

        // Header
        RowLayout {
            Layout.fillWidth: true
            spacing: 12

            Text {
                text: "Linux Island"
                font.pixelSize: 22
                font.bold: true
                color: "#F4F0E9"
            }

            Item { Layout.fillWidth: true }

            Rectangle {
                width: 12
                height: 12
                radius: 6
                color: settingsProxy.connected ? "#9DD2B1" : "#F2A3A0"
            }

            Text {
                text: settingsProxy.connected ? "Core Connected" : "Core Offline"
                font.pixelSize: 12
                color: "#C8C0B5"
            }
        }

        Rectangle {
            Layout.fillWidth: true
            height: 1
            color: "#575148"
        }

        // Theme Selection
        ColumnLayout {
            Layout.fillWidth: true
            spacing: 6

            Text {
                text: "Appearance Theme"
                font.bold: true
                font.pixelSize: 14
                color: "#F4F0E9"
            }

            RowLayout {
                spacing: 12
                RadioButton {
                    text: "System"
                    checked: settingsProxy.theme === "system"
                    onClicked: settingsProxy.setTheme("system")
                }
                RadioButton {
                    text: "Dark"
                    checked: settingsProxy.theme === "dark"
                    onClicked: settingsProxy.setTheme("dark")
                }
                RadioButton {
                    text: "Light"
                    checked: settingsProxy.theme === "light"
                    onClicked: settingsProxy.setTheme("light")
                }
            }
        }

        // Capsule Size Selection
        ColumnLayout {
            Layout.fillWidth: true
            spacing: 6

            Text {
                text: "Capsule Size"
                font.bold: true
                font.pixelSize: 14
                color: "#F4F0E9"
            }

            RowLayout {
                spacing: 12
                RadioButton {
                    text: "Small"
                    checked: settingsProxy.capsuleSize === "small"
                    onClicked: settingsProxy.setCapsuleSize("small")
                }
                RadioButton {
                    text: "Medium"
                    checked: settingsProxy.capsuleSize === "medium"
                    onClicked: settingsProxy.setCapsuleSize("medium")
                }
                RadioButton {
                    text: "Large"
                    checked: settingsProxy.capsuleSize === "large"
                    onClicked: settingsProxy.setCapsuleSize("large")
                }
            }
        }

        // Interaction Toggles
        ColumnLayout {
            Layout.fillWidth: true
            spacing: 8

            Text {
                text: "Interactions & Feeds"
                font.bold: true
                font.pixelSize: 14
                color: "#F4F0E9"
            }

            CheckBox {
                text: "Enable Smooth Animations"
                checked: settingsProxy.animationEnabled
                onToggled: settingsProxy.setAnimationEnabled(checked)
            }

            CheckBox {
                text: "Hover Preview on Capsule"
                checked: settingsProxy.hoverPreviewEnabled
                onToggled: settingsProxy.setHoverPreviewEnabled(checked)
            }

            CheckBox {
                text: "Smart Adaptive Fullscreen Auto-Hide"
                checked: settingsProxy.smartAdaptiveEnabled
                onToggled: settingsProxy.setSmartAdaptiveEnabled(checked)
            }

            CheckBox {
                text: "Notification Peek (Opt-in experimental)"
                checked: settingsProxy.notificationPeekEnabled
                onToggled: settingsProxy.setNotificationPeekEnabled(checked)
            }
        }

        Item { Layout.fillHeight: true }

        // Status & Error bar
        Rectangle {
            Layout.fillWidth: true
            height: 36
            radius: 8
            color: "#302D28"
            border.color: settingsProxy.errorMessage.length > 0 ? "#F2A3A0" : "#575148"

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 12
                anchors.rightMargin: 12

                Text {
                    text: settingsProxy.errorMessage.length > 0 ? settingsProxy.errorMessage : (settingsProxy.busy ? "Synchronizing..." : "Settings Synchronized")
                    color: settingsProxy.errorMessage.length > 0 ? "#F2A3A0" : "#A69C8F"
                    font.pixelSize: 12
                    elide: Text.ElideRight
                    Layout.fillWidth: true
                }
            }
        }
    }
}
