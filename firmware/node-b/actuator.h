#ifndef ACTUATOR_H
#define ACTUATOR_H

#include <PubSubClient.h>
#include <Arduino.h>

void initActuators();
void executeCommand(String commandId, String target, String action, PubSubClient& client);
void publishStatus(PubSubClient& client, bool online);
void publishTelemetry(PubSubClient& client);

// Trạng thái chia sẻ toàn cục cho các module
extern String light1State;
extern String fan1State;
extern String door1State;

#endif