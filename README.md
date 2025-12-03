# AWS Resource Overseer

A comprehensive React-based dashboard for exploring, monitoring, and auditing AWS infrastructure. This application provides a unified view of your AWS resources across regions and accounts, featuring real-time log streaming, resource dependency visualization, and AI-driven insights.

## Features

-   **Unified Inventory**: View resources from EC2, S3, RDS, Lambda, and more in a single, filterable list. Support for S3 bucket operations (Empty & Delete).
-   **Region Discovery**: Scan across all AWS regions to discover forgotten active resources like VPCs, EC2 instances, and Pipelines.
-   **CloudWatch Logs Explorer**: Stream logs in real-time or run SQL-like CloudWatch Insights queries. Includes an integrated AI assistant for analyzing log patterns and errors.
-   **Resource Dependency Graph**: Interactive visualization of relationships between resources (e.g., EC2 -> Security Group -> VPC).
-   **CloudFormation Management**: Monitor stack status, toggle termination protection, and perform bulk deletions with built-in safety checks.
-   **IAM Role Inspector**: Audit IAM roles and filter them by trusted entities (AWS accounts, Services, Federated users) to ensure security compliance.
-   **Systems Manager (SSM) Connect**: Quick access to start EC2 Session Manager sessions for active instances directly from the UI.
-   **Bedrock Agent Monitoring**: Inspect Amazon Bedrock Agent Runtimes, view their status, and access associated logs.
-   **Multi-Account Support**: Seamlessly switch between AWS Organization accounts by assuming roles directly from the dashboard.
-   **AI-Powered Audits**: Generate instant inventory summaries and tagging compliance reports using Google Gemini models.
-   **Theming**: Includes multiple themes such as Dark, Light, and AWS Console-inspired styles.

## Prerequisites

-   **Node.js**: v18 or higher recommended.
-   **AWS Credentials**: Access Key ID and Secret Access Key. 
    -   *Permissions*: Read-only permissions (`ViewOnlyAccess`) are sufficient for monitoring. Specific actions (like deleting stacks or S3 buckets) require write permissions.
-   **Google Gemini API Key**: Required for AI features (Log analysis and Inventory auditing).

## Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/yourusername/aws-resource-overseer.git
    cd aws-resource-overseer
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Environment Setup**:
    Create a `.env` file in the root directory to configure the AI integration:
    ```env
    API_KEY=your_google_gemini_api_key
    ```
    *Note: AWS credentials are entered via the application UI and are kept in memory state only.*

4.  **Start the application**:
    ```bash
    npm start
    ```

## Usage

1.  **Login**: 
    -   Enter your AWS Access Key ID, Secret Access Key, and optional Session Token.
    -   Select your target Region.
    -   **Demo Mode**: Click "Use Demo Data" to explore the application features with mock data without connecting to a live AWS account.

2.  **Navigation**:
    -   **Welcome**: View high-level account info and switch between Organization accounts.
    -   **Resource Overseer**: The main inventory view. Filter resources, view tags, and perform actions (Graph, Logs).
    -   **CloudFormation**: Manage infrastructure stacks.
    -   **IAM Roles**: Audit permissions and trust relationships.
    -   **Session Manager**: Connect to EC2 instances.
    -   **CloudWatch Logs**: Query and stream logs with AI assistance.
    -   **Region Discovery**: Find active resources in other regions.

## Technologies

-   **Frontend**: React 18, TypeScript, Tailwind CSS
-   **Visualization**: Recharts, Custom SVG Graphing
-   **AWS Integration**: AWS SDK for JavaScript v3 (Modular packages)
-   **AI Integration**: Google GenAI SDK (`@google/genai`)
-   **Icons**: Lucide React

## Security Note

This application runs entirely client-side. 
-   **AWS Credentials**: Credentials entered into the UI are used solely to make direct calls to AWS APIs from your browser. They are **not** sent to any backend server and are **not** persisted in local storage/cookies.
-   **API Keys**: The Google API key is used for the AI features.

## Author

Lukasz Rosiak

GitHub: @lukaszrosiak

## License

MIT
