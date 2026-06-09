package asterisk

import (
	"fmt"
	"log"
	"time"
)

func JoinConference(extension, roomNum string) (string, error) {
	client := GetAMIClient()
	if client == nil {
		return "", fmt.Errorf("AMI client not available")
	}

	channel := fmt.Sprintf("PJSIP/%s", extension)
	callID := fmt.Sprintf("conf-%s-%d", roomNum, time.Now().Unix())

	fields := map[string]string{
		"Channel":  channel,
		"Context":  "default",
		"Exten":    roomNum,
		"Priority": "1",
		"CallerID": fmt.Sprintf("Conference %s", roomNum),
		"Timeout":  "30000",
		"Variable": fmt.Sprintf("CALL_ID=%s", callID),
		"Async":    "true",
	}

	log.Printf("[AMI] Joining conference: extension=%s room=%s", extension, roomNum)

	response, err := client.SendCommand("Originate", fields)
	if err != nil {
		return "", fmt.Errorf("failed to join conference: %v", err)
	}

	if !response.Success {
		return "", fmt.Errorf("join conference failed: %s", response.Error)
	}

	return channel, nil
}

func KickParticipant(channel string) error {
	client := GetAMIClient()
	if client == nil {
		return fmt.Errorf("AMI client not available")
	}

	fields := map[string]string{
		"Channel": channel,
	}

	response, err := client.SendCommand("Hangup", fields)
	if err != nil {
		return fmt.Errorf("failed to kick participant: %v", err)
	}

	if !response.Success {
		return fmt.Errorf("kick failed: %s", response.Error)
	}

	log.Printf("Conference participant kicked: %s", channel)
	return nil
}
