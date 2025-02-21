import "dotenv/config";
import express, { Application } from "express";
import { PhoneNumberIdentifier } from "@azure/communication-common";
import {
  CallAutomationClient,
  CallConnection,
  CallMedia,
  TextSource,
  PlayOptions,
  TransferCallToParticipantOptions,
} from "@azure/communication-call-automation";
import { v4 as uuidv4 } from "uuid";

const PORT = process.env.PORT || 8080;
const app: Application = express();
app.use(express.json());

let callConnectionId: string;
let callConnection: CallConnection;
let acsClient: CallAutomationClient;
let callMedia: CallMedia;
let customerPhoneNumber: string;

const agentPhonenumber = process.env.AGENT_PHONE_NUMBER;
const greetingContext = "Greeting";
const greetingPrompt = "We are connecting you to an agent.";
const transferFailedContext = "TransferFailed";
const transferFailedPrompt = "Seems we can't connect you right now.";

async function createAcsClient() {
  const connectionString = process.env.CONNECTION_STRING || "";
  acsClient = new CallAutomationClient(connectionString);
  console.log("Initialized ACS Client.");
}

async function hangUpCall() {
  callConnection.hangUp(true);
}

async function handlePlay(
  callConnectionMedia: CallMedia,
  textToPlay: string,
  context: string
) {
  try {
    const play: TextSource = {
      text: textToPlay,
      voiceName: "en-US-NancyNeural",
      kind: "textSource",
    };
    const playOptions: PlayOptions = { operationContext: context };
    console.log("Playing text:", textToPlay);
    await callConnectionMedia.playToAll([play], playOptions);
  } catch (error) {
    console.error("Error playing text:", error);
  }
}

async function createOutboundCall(phoneNumber: string, callbackUri: string) {
  try {
    if (!process.env.ACS_RESOURCE_PHONE_NUMBER) {
      throw new Error("ACS_RESOURCE_PHONE_NUMBER is not set");
    }

    const callResult = await acsClient.createCall(
      {
        targetParticipant: {
          phoneNumber,
        },
        sourceCallIdNumber: {
          phoneNumber: process.env.ACS_RESOURCE_PHONE_NUMBER,
        },
      },
      callbackUri,
      {
        callIntelligenceOptions: {
          cognitiveServicesEndpoint: process.env.COGNITIVE_SERVICE_ENDPOINT,
        },
      }
    );

    callConnection = callResult.callConnection;
    callConnectionId = callResult.callConnectionProperties.callConnectionId;
    callMedia = callConnection.getCallMedia();
    customerPhoneNumber = phoneNumber;
    return true;
  } catch (error) {
    console.error("Error creating outbound call:", error);
    return false;
  }
}

app.post("/api/outboundCall", async (req, res) => {
  try {
    const callRequest = req.body as {
      phoneNumber: string;
      message?: string;
    };

    if (!callRequest.phoneNumber) {
      res.status(400).json({ error: "Target phone number is required" });
      return;
    }

    const uuid = uuidv4();
    const callbackUri = `${process.env.CALLBACK_URI}/api/callbacks/${uuid}`;

    const success = await createOutboundCall(
      callRequest.phoneNumber,
      callbackUri
    );

    if (success && callConnectionId) {
      res.status(200).json({
        message: "Outbound call initiated successfully",
        callId: callConnectionId,
      });
    } else {
      res.status(500).json({ error: "Failed to create outbound call" });
    }
  } catch (error) {
    console.error("Error in outbound call endpoint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/callbacks/:contextId", async (req, _res) => {
  const event = req.body[0];
  const eventData = event.data;
  console.log(`Received callback event -> ${JSON.stringify(eventData)} `);
  console.log(`event type -> ${event.type}`);

  if (event.type === "Microsoft.Communication.CallConnected") {
    console.log("Received CallConnected event");
    handlePlay(callMedia, greetingPrompt, greetingContext);
  } else if (event.type === "Microsoft.Communication.CallTransferAccepted") {
    console.log("Call transfer accepted event received");
  } else if (event.type === "Microsoft.Communication.PlayCompleted") {
    console.log("Play completed event received");
    if (eventData.operationContext === greetingContext) {
      console.log("Initiating the call transfer.");
      const transferDestination: PhoneNumberIdentifier = {
        phoneNumber: agentPhonenumber,
      };
      const transferOptions: TransferCallToParticipantOptions = {
        operationContext: "TransferCallToAgent",
        transferee: { phoneNumber: customerPhoneNumber },
      };
      const result = await callConnection.transferCallToParticipant(
        transferDestination,
        transferOptions
      );
      console.log("Transfer call initiated", result);
    } else if (eventData.operationContext === transferFailedContext) {
      hangUpCall();
    }
  } else if (event.type === "Microsoft.Communication.CallTransferFailed") {
    console.log("Call transfer failed event received");
    const resultInformation = eventData.resultInformation;
    console.log(
      "Encountered error during call transfer, message=%s, code=%s, subCode=%s",
      resultInformation?.message,
      resultInformation?.code,
      resultInformation?.subCode
    );
    handlePlay(callMedia, transferFailedPrompt, transferFailedContext);
  } else if (event.type === "Microsoft.Communication.CallDisconnected") {
    console.log("Received CallDisconnected event");
  } else {
    console.warn(`Unhandled event type: ${event.type}`);
  }
});

app.listen(PORT, async () => {
  console.log(`Server is listening on port ${PORT}`);
  await createAcsClient();
});
