const express = require("express");
const bodyParser = require("body-parser");
const { spawn } = require("child_process");
const fetch = require("node-fetch");
const cheerio = require("cheerio");
const cors = require("cors");
const mongoose = require("mongoose"); // Add this line

const app = express();
app.use(cors());
const port = 3002;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// MongoDB connection
mongoose.connect("mongodb://localhost:27017/mydatabase", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));
db.once("open", () => {
  console.log("Connected to MongoDB database");
});

// Define a schema for saving data to MongoDB
const DataSchema = new mongoose.Schema({
  title: String,
  target_industry: [String],
  problem_statement: [String],
  output: [String],
});

// Create a model based on the schema
const DataModel = mongoose.model("DataModel", DataSchema);

app.post("/post", async (req, res) => {
  try {
    const { title, target_industry, problem_statement } = req.body;

    // Save input data to MongoDB
    const inputData = new DataModel({
      title,
      target_industry: target_industry.split(",").map((term) => term.trim()),
      problem_statement: problem_statement
        .split(",")
        .map((term) => term.trim()),
    });
    await inputData.save();

    const targetIndustriesArray = target_industry
      .split(",")
      .flatMap((term) => term.split(/\s*,\s*/))
      .map((term) => term.trim());

    const array1 = problem_statement.split(",").map((term) => term.trim());

    const industryData = await fetchIndustryData(targetIndustriesArray);
    const pythonProcess = spawn("python", [
      "script3.py",
      title,
      JSON.stringify(industryData),
      JSON.stringify(array1),
    ]);

    let responseData = [];

    pythonProcess.stdout.on("data", async (data) => {
      const response = data.toString().trim();

      responseData.push(response);
      const formattedData = responseData[0]
        .split("\n")
        .map((item) => item.trim());

      console.log(formattedData);

      // Update output in MongoDB
      await DataModel.findOneAndUpdate(
        { title },
        { output: formattedData },
        { new: true }
      );

      res.json({ message: "Data processed successfully", data: formattedData });
    });
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

async function fetchIndustryData(industries) {
  try {
    const industryData = [];

    for (const industry of industries) {
      let searchCount = await fetchSearchCount(industry);

      while (searchCount === null || isNaN(searchCount)) {
        searchCount = await fetchSearchCount(industry);
      }
      industryData.push(Number(searchCount));
    }

    return industryData;
  } catch (error) {
    console.error("Error fetching industry data:", error);
    return [];
  }
}

async function fetchSearchCount(industry) {
  try {
    const bingSearchUrl = `https://www.bing.com/search?q=${encodeURIComponent(
      industry
    )}`;
    const response = await fetch(bingSearchUrl);
    const body = await response.text();

    const $ = cheerio.load(body);
    const searchCountElement = $(".sb_count").first();
    const searchCountText = searchCountElement.text().trim();
    const trimmedString = searchCountText.replace(/,/g, "").replace(/\D/g, "");

    return trimmedString;
  } catch (error) {
    console.error("Error fetching search count:", error);
    return "Error";
  }
}

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
