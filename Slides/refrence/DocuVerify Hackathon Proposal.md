# **DocuVerify Shipping Agent 🚢**

**Automating Shipping Document Verification from Inbox to Discrepancy Report**

## **1\. Executive Summary**

The shipping operations team struggles with manually parsing emails, identifying document-check requests, and meticulously comparing Shipping Instructions (SI) against draft Bills of Lading (BL). Manual checks are slow, prone to human error, and suffer from formatting inconsistencies (e.g., "Load Port" vs. "Port of Loading").

**DocuVerify** is an end-to-end deterministic and AI-powered pipeline designed to classify incoming emails, extract 7 mandatory shipping fields accurately across varied document formats, and intelligently surface discrepancies while seamlessly escalating uncertain cases to a modern Human-In-The-Loop (HITL) frontend dashboard.

## **2\. System Architecture Pipeline**

graph TD  
&nbsp;&nbsp;&nbsp;&nbsp;A\[Inbox / Email JSON\] \--\> B\[Stage 1: Intent Classifier\]  
&nbsp;&nbsp;&nbsp;&nbsp;B \-- Spam / Other \--\> C\[Log & Skip\]  
&nbsp;&nbsp;&nbsp;&nbsp;B \-- Document Comparison \--\> D\[Stage 2: Multi-Modal Ingestion\]  
&nbsp;&nbsp;&nbsp;&nbsp;  
&nbsp;&nbsp;&nbsp;&nbsp;D \-- Plain-text / Docx \--\> E\[Layout Parser\]  
&nbsp;&nbsp;&nbsp;&nbsp;D \-- Scanned / Image PDF \--\> F\[Vision LLM\]  
&nbsp;&nbsp;&nbsp;&nbsp;  
&nbsp;&nbsp;&nbsp;&nbsp;E \--\> G\[Stage 3: Schema-Enforced Extraction\]  
&nbsp;&nbsp;&nbsp;&nbsp;F \--\> G  
&nbsp;&nbsp;&nbsp;&nbsp;  
&nbsp;&nbsp;&nbsp;&nbsp;G \--\> H\[Stage 4: Normalization & Comparison Engine\]  
&nbsp;&nbsp;&nbsp;&nbsp;  
&nbsp;&nbsp;&nbsp;&nbsp;H \-- Low Confidence / Missing / Unreadable \--\> I\[Stage 5: HITL Frontend Dashboard\]  
&nbsp;&nbsp;&nbsp;&nbsp;I \-- Human Override \--\> J  
&nbsp;&nbsp;&nbsp;&nbsp;  
&nbsp;&nbsp;&nbsp;&nbsp;H \-- High Confidence Match/Mismatch \--\> J\[JSON Output Evaluator\]  
&nbsp;&nbsp;&nbsp;&nbsp;J \--\> K\[POST /submit\]

### **Stage 1: Intent Classification**

* **Goal:** Filter the inbox.  
* **Implementation:** A lightweight LLM call or fine-tuned classifier categorizes emails into: DOCUMENT\_COMPARISON, NEW\_SI\_REQUEST, INVOICE\_QUERY, GENERAL, SPAM. Non-comparison requests are logged and skipped.

### **Stage 2: Multi-Modal Ingestion (The Advanced Challenge)**

* **Goal:** Handle pristine text, Word docs, and messy scanned PDFs.  
* **Implementation:**  
  * Route plain text/docx to lightweight parsers (e.g., Docling or pdfplumber).  
  * Route image-only or scanned PDFs to a multi-modal vision model (e.g., Gemini 1.5 Pro) specifically prompted to maintain table structures.

### **Stage 3: Schema-Enforced Extraction**

* **Goal:** Extract the 7 required fields predictably.  
* **Implementation:** Use **Instructor \+ Pydantic** to force the LLM to output exact JSON matching our required schema:  
  * shipper, consignee, notify\_party  
  * port\_of\_loading, port\_of\_discharge  
  * container\_count (integer), gross\_weight\_kg (float)  
  * *Metadata:* Confidence scores and source text spans for auditability.

### **Stage 4: Deterministic Normalization & Comparison**

* **Goal:** Compare SI vs BL robustly without false alarms.  
* **Implementation:**  
  * **Unit Normalization:** Use Pint to convert LBS/Tons to KG before comparison.  
  * **String Normalization:** Use RapidFuzz for party names and port aliases to handle minor typos.  
  * **Logic:** If all 7 match exactly or semantically, output *"No mismatch detected"*. If mismatched, output exact format SI: \[val\] / BL: \[val\].

### **Stage 5: Human-In-The-Loop (HITL) Gateway**

* **Goal:** Never fail silently. Ensure reliability via human oversight.  
* **Implementation:** If confidence is $\< 0.85$, a document is unreadable, or a field is missing, the backend flags the payload. The frontend fetches these flagged cases, allowing an operator to see the source document and the AI's best guess side-by-side, correct it, and click "Approve & Submit."

## **3\. Technology Stack**

### **Frontend (User Interface & HITL Dashboard)**

* **Framework:** **Next.js (React)** \- Provides a robust, fast-rendering web interface for the operations team.  
* **Styling:** **Tailwind CSS** combined with **Shadcn UI** for clean, enterprise-grade data tables, side-by-side document viewers, and interactive forms.  
* **Document Viewer:** **React-PDF** to render the original SI and BL attachments directly in the browser with bounding box overlays for visual verification.

### **Backend & AI Processing**

* **API & Orchestration:** **Python, FastAPI** \- High performance, asynchronous backend to handle the processing pipeline and serve the frontend.  
* **AI / LLM Integration:** **Instructor** (for Pydantic schema enforcement), **LiteLLM** (to route requests to Gemini or other foundational models).  
* **Document Parsing:** **Docling** and **pdfplumber** for text extraction.  
* **Data Normalization:** **RapidFuzz** (fuzzy string matching) and **Pint** (physical unit conversions).

## **4\. Mapping to Judging Criteria (100 Points Total)**

| Criteria (Points) | How DocuVerify Achieves Maximum Points |
| :---- | :---- |
| **Working Core Prototype (25)** | The system directly interfaces with loader.py, processes the local Docker bundle, and formats the output exactly for the /submit evaluation endpoint via the FastAPI backend. |
| **System Design & Architecture (15)** | Clean separation of concerns (React Frontend \-\> FastAPI Backend \-\> Multi-modal Pipeline). Highly scalable and modular. |
| **Technology Integration (15)** | Seamlessly blends traditional deterministic logic (RapidFuzz/Pint) with generative AI (Instructor/Vision LLMs) for optimal accuracy and low latency. |
| **Technical Feasibility (15)** | Highly feasible. It relies on proven extraction patterns and explicitly delegates edge cases to the HITL React dashboard rather than aiming for an impossible 100% AI success rate. |
| **Innovation & Solution Approach (10)** | The "Source Grounding" feature in the frontend—where every extracted field links directly to a highlighted text block in the original PDF—builds massive operational trust. |
| **Problem Statement Understanding (10)** | Directly addresses the core pain points: categorizing the inbox, finding hidden discrepancies, and resolving formatting inconsistencies (e.g., Port of Loading vs Load Port). |
| **Practical Value & Potential (10)** | The custom Next.js HITL dashboard transforms a backend script into a true enterprise-ready operational tool that teams can use immediately. |

&nbsp;