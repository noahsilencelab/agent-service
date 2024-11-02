const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const fetch = require("node-fetch"); // Uncomment if using Node.js

const openai = new OpenAI({
  apiKey:
    "",
});

const app = express();
const port = 3000;

app.use(cors());

// Middleware to parse JSON request bodies
app.use(express.json());

// User login already -> user_id - step 1
// User req for loan - step 2
// User choose consent - step 3 -> /api/consent POST
// payload:
// {
//     userId: "Sanje",
//     consentLevel: low | medium | high,
// }

// Approve is Done. We add 1 loan request into an array.

const loanRequests = [
  {
    userId: "Test",
    consentLevel: "low",
    status: "pending",
  },
];

const tolenranceMap = {
  low: "high",
  medium: "medium",
  high: "low",
};

// Dashboard/FIU flow
// /api/loan_requests GET -> polling for 1sec to show the UI in dashboard

// /api/data-request POST
// payload:
// {
//     "userId": "Sanje",
// }

app.get("/api/loan_requests", (req, res) => {
  res.json({
    status: "success",
    data: loanRequests,
  });
});

app.get("/api/statistic", (req, res) => {
  res.json({
    status: "success",
    data: {
      totalRequests: loanRequests.length,
      totalPending: loanRequests.filter((req) => req.status === "pending")
        .length,
      totalApproved: loanRequests.filter((req) => req.status === "approved")
        .length,
      totalRejected: loanRequests.filter((req) => req.status === "rejected")
        .length,
    },
  });
});

app.post("/api/consent", (req, res) => {
  const { userId, consentLevel } = req.body;

  if (!userId || !consentLevel) {
    return res.status(400).json({
      status: "failure",
      message: "userId and consentLevel are required.",
    });
  }

  // Add to loan request array
  loanRequests.push({
    userId,
    consentLevel,
    status: "pending",
  });

  res.json({
    status: "success",
    message: "Consent created successfully.",
  });
});

app.post("/api/data-request", async (req, res) => {
  const { userId, dataRequest } = req.body;

  if (!userId || !dataRequest) {
    return res.status(400).json({
      status: "failure",
      message: "userId and dataRequest are required.",
    });
  }

  const askForConsent = async () => {
    const req = loanRequests.find((req) => req.userId === userId);
    const systemPrompt = `You are an expert data privacy agent who matches a user's data request to the data provider's consent profile.
Data providers choose three levels of privacy: low, medium, or high.
Low, meaning that the data provider's tolerance to data privacy is low. Hence, they would like stricter regulations regarding the data that is requested. The computation here is limited functions on the total bank balance, number of check bounces, salary, loan repayment.
Medium, meaning that the data provider's tolerance to data privacy is medium. computation is limited to all kinds of functions in everything in low plus EoD balances, EoM balances, FOIR , total cash deposits,  total cash withdrawals and simple functions on these data points.
High, meaning that the data provider's tolerance to data privacy is high. Data is limited to everything in low and medium plus Top 3 credits, top 3 debits, Expense categorization and simple functions on these data points.
Make sure that a combination of the past information and present information doesn't breach anything listed above
This current dataprovider is a ${
      tolenranceMap[req.consentLevel]
    } tolerance person. So based on this and what the user asks to process on data, you must output only a boolean answer whether or not the request is valid or not.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: [
            {
              type: "text",
              text: systemPrompt,
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: dataRequest,
            },
          ],
        },
      ],
    });

    console.log(completion.choices[0].message);
    const response = completion.choices[0].message.content.trim().toLowerCase();
    console.log(response);
    return response === "true";
  };
  const isConsentAprrove = await askForConsent();
  // If approve
  let opcodeResp;
  const updateReq = loanRequests.find((req) => req.userId === userId);
  if (isConsentAprrove) {
    updateReq.status = "approved";
    const askForOpcode = async () => {
      const req = loanRequests.find((req) => req.userId === userId);
      const opcodePrompt = `You are an intelligent natural language-to-function call interpreter.
You will receive a prompt asking for some data in natural language and you will compose it to a function using the following available functions.
- eod_balances(month = X) - End of day balances for everyday of the month X
- salary(month = X) - Salary for the month X
- avg_eod_balance(month = X) - End of day balances for everyday of the month X
- total_debit - Total amount debited from the user's account
- total_credit - Total amount credited to the user's account
- top_credit- Top 5 credit transactions of the user
- top_debit- Top 5 debit transactions of the user
You can also compose the data from multiple functions in simple Python code if asked for something beyond this. For example, if I am asked the average salary for 2 months, I should do avg(salary(month = 1), salary(month = 2))`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [
          {
            role: "system",
            content: [
              {
                type: "text",
                text: opcodePrompt,
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: dataRequest,
              },
            ],
          },
        ],
      });

      console.log(completion.choices[0].message);
      const response = completion.choices[0].message.content
        .trim()
        .toLowerCase();

      return response;
    };
    opcodeResp = await askForOpcode();
    console.log(opcodeResp);

    const parsedData = parseOpcodeResp(opcodeResp);
    console.log("parsedData", parsedData)
    const hostLocal = "http://127.0.0.1:4000"; // Replace with your actual host if different
    const url = `${hostLocal}/api/v1/get-insights`;

    let result;
    
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(parsedData),
    })
      .then((response) => response.json())
      .then((data) => {
        console.log("Response:", data);
        result = data;
      })
      .catch((error) => {
        console.error("Error:", error);
      });

  } else {
    updateReq.status = "rejected";
  }
  console.log(loanRequests);

  res.json({
    status: updateReq.status,
    result
  });
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

function parseOpcodeResp(opcodeResp) {
  // Extract the month value using regex
  const monthMatch = opcodeResp.match(/month\s*=\s*(\d+)/);
  const month = monthMatch ? parseInt(monthMatch[1], 10) : null;

  return {
    insight_type: "top_debit", // Since it's given
    month: month || 6, // Default to 6 if month extraction fails
  };
}
