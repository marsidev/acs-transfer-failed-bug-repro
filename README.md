# Call Automation Bug Reproduction

This repository contains a minimal sample to reproduce a bug in Azure Communication Services Call Automation where an error occurs when trying to play a prompt after a call transfer fails.

## Setup

1. Clone this repository
2. Run `npm install`
3. Copy `.env.example` to `.env` and fill in the required values:
   ```
   PORT=8080                         # Local server port
   CONNECTION_STRING=                # ACS resource connection string
   CALLBACK_URI=                     # Your callback URL (e.g. from ngrok, dev tunnel, etc.)
   COGNITIVE_SERVICE_ENDPOINT=       # Azure AI service endpoint
   ACS_RESOURCE_PHONE_NUMBER=        # Your ACS phone number
   AGENT_PHONE_NUMBER=               # Target phone number for transfer
   ```
4. Start the server with `npm run dev`

## Bug Description

When attempting to play a prompt after a call transfer fails, an error occurs in the Call Automation service.

### Steps to Reproduce

1. Make a POST request to initiate the outbound call:
   ```
   POST http://localhost:8080/api/outboundCall
	 Content-Type: application/json

   {
     "phoneNumber": "+1234567890"  // The phone number to call
   }
   ```
2. Wait for the transfer attempt
3. After transfer fails, the service attempts to play a prompt
4. Error occurs at this point

You can use tools like Postman, curl, or any HTTP client to make the POST request.

Example using curl:
```bash
curl -X POST http://localhost:8080/api/outboundCall \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+1234567890"}'
```
