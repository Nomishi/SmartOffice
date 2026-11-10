#ifndef DOOR_SENSOR_H
#define DOOR_SENSOR_H

#include <PubSubClient.h>

void initDoorSensor();
void handleDoorSensor(PubSubClient& client);

#endif