# Azure Pricing Calculator — AI Architecture & Data Flow

When a user interacts with the AI Assistant to ask about pricing (e.g., *"How much do 5 Windows VMs cost?"*), a highly-architected data flow is triggered to guarantee that the AI generates perfectly accurate, up-to-date pricing by fetching data straight from our PostgreSQL database. 

Here is exactly how the process works from frontend to backend and back to the user:

### 1. The User Input (Frontend)
The user enters a prompt in the chat interface via **`frontend/src/.../Chat.jsx`**. The frontend wraps this text into a standardized payload and sends a `POST` request to the backend `/api/chat` route, ensuring the user's authentication token is attached.

### 2. Backend Orchestration (`index.js` & `ai.js`)
The backend route picks up the request and prepares the context for OpenAI. 
- It pulls the past conversation history.
- It attaches an intensive System Prompt that enforces strict calculation policies.
- **Crucially**, it provides the LLM with an array of **Tools (Function Calling)**. The most important tool is the `calculate_estimate` function, giving the AI the ability to deliberately request pricing data from our system parameters.

### 3. OpenAI's Decision Making
The prompt alongside our tool definitions is sent to OpenAI's GPT model. The LLM interprets the natural language request (e.g., *"5 Windows VMs"*) and realizes it lacks live knowledge. It chooses to invoke the `calculate_estimate` tool and parses the user's text into strict JSON parameters:
```json
{
  "service": "Virtual Machines",
  "sku": "D2s v3",
  "quantity": 5,
  "os": "Windows",
  "region": "eastus"
}
```

### 4. Executing the Tool against the DB (`aiTools.js`)
Our backend receives the request to execute `calculate_estimate`. This process handles the raw parameters supplied by the LLM:
- **Parameter Translation:** It converts ambiguous terms into explicit SQL modifiers (e.g. `isWindows` -> `product_name ILIKE '%Windows%'`).
- **SQL Execution (`db.js`):** It dynamically builds a query to hit our main `azure_prices` PostgreSQL table (which is kept perfectly up-to-date via Python sync scripts).
- **Cost Arithmetic:** It processes the returned `retail_price`. Depending on the parameters, it correctly splits up monthly, hourly, or upfront (Reservation) costs. It automatically handles edge cases, such as adding the separate OS markup when a user requests a Windows VM under a 1-year reservation.
- **Payload Return:** After doing the math, it returns the structured exact costs (a JSON array titled `breakdown` with their `itemCost`s) back to the running OpenAI thread.

### 5. AI Synthesis and Output
OpenAI ingests the tool result—now armed with completely factual, 100% accurate database records—and writes a conversational response natively in markdown. 

For instance: *"The price for 5 Standard D2s v3 VMs running Windows in East US will cost you $X.YZ per month."*

### 6. Display to User
The final message block is streamed or returned to the frontend `/api/chat` endpoint and immediately formatted onto the user's screen in the chat interface. Because of this exact tool-calling structure, our AI avoids hallucinating prices and provides results intrinsically tethered to the live backend data.


---

## Testing Rule

**All test and debug scripts must live in `backend/scripts/testing/`.** This is the only designated place for exploratory scripts, one-off checks, and throwaway test files.

- Create test scripts inside `backend/scripts/testing/`
- Delete them once they are no longer needed
- Never leave loose test/debug files in the project root, `backend/`, or any other folder
- Never commit temporary output dumps (e.g. `out.json`, `test_out.json`, `debug_*.json`) -- run locally and delete when done
