const express = require("express");
const OpenAI = require("openai");
const openai = new OpenAI({
  apiKey:
    "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",
});

const app = express();
const port = 3000;

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
              "type": "text",
              "text": systemPrompt,
            }
          ],
        },
        {
          role: "user",
          content: [
            {
              "type": "text",
              "text": dataRequest
            }
          ]
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
  const req = loanRequests.find((req) => req.userId === userId);
  if (isConsentAprrove) {
    req.status = "approved";
  } else {
    req.status = "rejected";
  }
  console.log(loanRequests);

  res.json({
    status: req.status,
    message: "Data request created successfully.",
  });
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
