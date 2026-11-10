#ifndef WIFI_MQTT_H
#define WIFI_MQTT_H

#include <PubSubClient.h>

void setupWiFi();
void reconnectMQTT(PubSubClient& client);
void handleMqttLoop(PubSubClient& client);

#endif