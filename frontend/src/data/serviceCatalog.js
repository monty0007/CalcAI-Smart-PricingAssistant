import {
    Monitor, Database, HardDrive, Globe, Brain, Shield,
    Cloud, Cpu, Container, BarChart3, Gamepad2, Link,
    Radio, Settings, Layers, Box, Atom, Zap,
    Phone, Code, MessageSquare, Laptop
} from 'lucide-react';

export const SERVICE_FAMILIES = [
    { id: 'Compute', name: 'Compute', icon: 'Cpu', description: 'Virtual machines, containers, serverless' },
    { id: 'Storage', name: 'Storage', icon: 'HardDrive', description: 'Blob, disk, file, and archive storage' },
    { id: 'Databases', name: 'Databases', icon: 'Database', description: 'SQL, NoSQL, caching, and managed databases' },
    { id: 'Networking', name: 'Networking', icon: 'Globe', description: 'VPN, CDN, load balancers, DNS' },
    { id: 'AI + Machine Learning', name: 'AI + Machine Learning', icon: 'Brain', description: 'OpenAI, cognitive services, ML' },
    { id: 'Analytics', name: 'Analytics', icon: 'BarChart3', description: 'Synapse, Databricks, Data Factory' },
    { id: 'Security', name: 'Security', icon: 'Shield', description: 'Key Vault, Sentinel, DDoS protection' },
    { id: 'Containers', name: 'Containers', icon: 'Container', description: 'Kubernetes, container instances, registry' },
    { id: 'Developer Tools', name: 'Developer Tools', icon: 'Code', description: 'DevOps, DevTest Labs, API Management' },
    { id: 'Integration', name: 'Integration', icon: 'Link', description: 'Logic Apps, Service Bus, Event Grid' },
    { id: 'Internet of Things', name: 'Internet of Things', icon: 'Radio', description: 'IoT Hub, IoT Central, Digital Twins' },
    { id: 'Management and Governance', name: 'Management and Governance', icon: 'Settings', description: 'Monitor, Cost Management, Policy' },
    { id: 'Web', name: 'Web', icon: 'Monitor', description: 'App Service, Static Web Apps, SignalR' },
    { id: 'Mixed Reality', name: 'Mixed Reality', icon: 'Layers', description: 'Spatial Anchors, Remote Rendering' },
    { id: 'Azure Communication Services', name: 'Azure Communication Services', icon: 'MessageSquare', description: 'SMS, voice, video, email' },
    { id: 'Windows Virtual Desktop', name: 'Windows Virtual Desktop', icon: 'Laptop', description: 'Virtual desktop infrastructure' },
    { id: 'Gaming', name: 'Gaming', icon: 'Gamepad2', description: 'PlayFab, game development services' },
    { id: 'Quantum Computing', name: 'Quantum Computing', icon: 'Atom', description: 'Quantum workspace, simulators' },
    { id: 'Azure Arc', name: 'Azure Arc', icon: 'Cloud', description: 'Hybrid and multi-cloud management' },
    { id: 'Azure Stack', name: 'Azure Stack', icon: 'Box', description: 'On-premises Azure services' },
    { id: 'Dynamics', name: 'Dynamics', icon: 'Zap', description: 'Business applications and CRM' },
    { id: 'Power Platform', name: 'Power Platform', icon: 'Zap', description: 'Power Apps, Power Automate' },
    { id: 'Telecommunications', name: 'Telecommunications', icon: 'Phone', description: 'Operator services, 5G core' },
    { id: 'Other', name: 'Other', icon: 'Layers', description: 'Additional Azure services' },
];

export const ICON_MAP = {
    Cpu, HardDrive, Database, Globe, Brain, BarChart3, Shield, Container,
    Code, Link, Radio, Settings, Monitor, Layers, MessageSquare, Laptop,
    Gamepad2, Atom, Cloud, Box, Zap, Phone
};

export const POPULAR_SERVICES = [
    // Compute
    { serviceName: 'Virtual Machines', serviceFamily: 'Compute', description: 'Linux & Windows VMs in seconds', popular: true },
    { serviceName: 'Azure App Service', serviceFamily: 'Compute', description: 'Build and host web apps', popular: true },
    { serviceName: 'Azure Functions', serviceFamily: 'Compute', description: 'Serverless compute service', popular: true },
    { serviceName: 'Azure Kubernetes Service', serviceFamily: 'Compute', description: 'Managed Kubernetes clusters', popular: true },
    { serviceName: 'Azure Container Apps', serviceFamily: 'Compute', description: 'Serverless container hosting', popular: true },
    { serviceName: 'Azure Spring Cloud', serviceFamily: 'Compute', description: 'Spring Boot apps on Azure' },
    { serviceName: 'Azure Batch', serviceFamily: 'Compute', description: 'Large-scale parallel computing' },
    { serviceName: 'Cloud Services', serviceFamily: 'Compute', description: 'Classic cloud service hosting' },

    // Storage
    { serviceName: 'Storage', serviceFamily: 'Storage', description: 'Blob, file, queue, and table storage', popular: true },
    { serviceName: 'Azure NetApp Files', serviceFamily: 'Storage', description: 'Enterprise-grade file shares' },
    { serviceName: 'Azure Data Lake Storage', serviceFamily: 'Storage', description: 'Scalable data lake storage' },
    { serviceName: 'Azure Managed Disks', serviceFamily: 'Storage', description: 'Persistent disk storage for VMs' },

    // Databases
    { serviceName: 'SQL Database', serviceFamily: 'Databases', description: 'Managed SQL database service', popular: true },
    { serviceName: 'Azure Cosmos DB', serviceFamily: 'Databases', description: 'Globally distributed NoSQL database', popular: true },
    { serviceName: 'Azure Database for PostgreSQL', serviceFamily: 'Databases', description: 'Managed PostgreSQL database', popular: true },
    { serviceName: 'Azure Database for MySQL', serviceFamily: 'Databases', description: 'Managed MySQL database', popular: true },
    { serviceName: 'Redis Cache', serviceFamily: 'Databases', description: 'In-memory data store', popular: true },
    { serviceName: 'SQL Managed Instance', serviceFamily: 'Databases', description: 'Fully managed SQL instance' },
    { serviceName: 'Azure Database for MariaDB', serviceFamily: 'Databases', description: 'Managed MariaDB database' },

    // Networking
    { serviceName: 'Virtual Network', serviceFamily: 'Networking', description: 'Private network infrastructure', popular: true },
    { serviceName: 'Azure DNS', serviceFamily: 'Networking', description: 'DNS hosting service' },
    { serviceName: 'Azure CDN', serviceFamily: 'Networking', description: 'Content delivery network' },
    { serviceName: 'Azure Firewall', serviceFamily: 'Networking', description: 'Cloud-native firewall service' },
    { serviceName: 'Load Balancer', serviceFamily: 'Networking', description: 'Layer 4 load balancing', popular: true },
    { serviceName: 'VPN Gateway', serviceFamily: 'Networking', description: 'Cross-premises connectivity' },
    { serviceName: 'Application Gateway', serviceFamily: 'Networking', description: 'Layer 7 load balancer/WAF' },
    { serviceName: 'Azure Front Door', serviceFamily: 'Networking', description: 'Global load balancer & CDN' },
    { serviceName: 'Azure ExpressRoute', serviceFamily: 'Networking', description: 'Dedicated private connection' },
    { serviceName: 'Network Watcher', serviceFamily: 'Networking', description: 'Network monitoring & diagnostics' },
    { serviceName: 'Azure Bastion', serviceFamily: 'Networking', description: 'Secure RDP/SSH access' },
    { serviceName: 'Virtual WAN', serviceFamily: 'Networking', description: 'Unified WAN management' },

    // AI + ML
    { serviceName: 'Foundry Models', serviceFamily: 'AI + Machine Learning', description: 'Azure OpenAI & foundation models', popular: true },
    { serviceName: 'Foundry Tools', serviceFamily: 'AI + Machine Learning', description: 'AI services: vision, speech, language', popular: true },
    { serviceName: 'Azure Machine Learning', serviceFamily: 'AI + Machine Learning', description: 'Build and deploy ML models' },
    { serviceName: 'Azure Bot Service', serviceFamily: 'AI + Machine Learning', description: 'Intelligent bot framework' },
    { serviceName: 'Azure AI Search', serviceFamily: 'AI + Machine Learning', description: 'AI-powered search service' },

    // Analytics
    { serviceName: 'Azure Synapse Analytics', serviceFamily: 'Analytics', description: 'Limitless analytics service', popular: true },
    { serviceName: 'Azure Databricks', serviceFamily: 'Analytics', description: 'Fast Apache Spark analytics', popular: true },
    { serviceName: 'Azure Data Factory', serviceFamily: 'Analytics', description: 'Data integration service' },
    { serviceName: 'Azure Stream Analytics', serviceFamily: 'Analytics', description: 'Real-time analytics' },
    { serviceName: 'HDInsight', serviceFamily: 'Analytics', description: 'Open-source analytics clusters' },
    { serviceName: 'Data Lake Store', serviceFamily: 'Analytics', description: 'Hyperscale data lake' },
    { serviceName: 'Azure Purview', serviceFamily: 'Analytics', description: 'Unified data governance' },
    { serviceName: 'Log Analytics', serviceFamily: 'Analytics', description: 'Log data analytics' },
    { serviceName: 'Event Hubs', serviceFamily: 'Analytics', description: 'Real-time data ingestion' },
    { serviceName: 'Time Series Insights', serviceFamily: 'Analytics', description: 'IoT analytics and visualization' },

    // Security
    { serviceName: 'Key Vault', serviceFamily: 'Security', description: 'Secrets and key management', popular: true },
    { serviceName: 'Azure Active Directory', serviceFamily: 'Security', description: 'Identity and access management' },
    { serviceName: 'Microsoft Defender for Cloud', serviceFamily: 'Security', description: 'Cloud security posture' },
    { serviceName: 'Azure DDoS Protection', serviceFamily: 'Security', description: 'DDoS attack protection' },

    // Containers
    { serviceName: 'Container Instances', serviceFamily: 'Containers', description: 'Run containers without servers' },
    { serviceName: 'Container Registry', serviceFamily: 'Containers', description: 'Docker container registry' },

    // Developer Tools
    { serviceName: 'Azure DevOps', serviceFamily: 'Developer Tools', description: 'CI/CD and project management' },
    { serviceName: 'API Management', serviceFamily: 'Developer Tools', description: 'API gateway and management', popular: true },
    { serviceName: 'Azure DevTest Labs', serviceFamily: 'Developer Tools', description: 'Dev/test environments' },

    // Integration
    { serviceName: 'Service Bus', serviceFamily: 'Integration', description: 'Enterprise message broker' },
    { serviceName: 'Logic Apps', serviceFamily: 'Integration', description: 'Automated workflows' },
    { serviceName: 'Event Grid', serviceFamily: 'Integration', description: 'Event routing service' },

    // IoT
    { serviceName: 'IoT Hub', serviceFamily: 'Internet of Things', description: 'IoT device management', popular: true },
    { serviceName: 'Azure Digital Twins', serviceFamily: 'Internet of Things', description: 'Digital twin platform' },
    { serviceName: 'Azure Maps', serviceFamily: 'Internet of Things', description: 'Geospatial services' },

    // Mgmt
    { serviceName: 'Azure Monitor', serviceFamily: 'Management and Governance', description: 'Full-stack monitoring', popular: true },
    { serviceName: 'Azure Backup', serviceFamily: 'Management and Governance', description: 'Cloud backup service' },
    { serviceName: 'Azure Site Recovery', serviceFamily: 'Management and Governance', description: 'Disaster recovery' },
    { serviceName: 'Automation', serviceFamily: 'Management and Governance', description: 'Process automation' },

    // Web
    { serviceName: 'Azure SignalR Service', serviceFamily: 'Web', description: 'Real-time web functionality' },
    { serviceName: 'Azure Notification Hubs', serviceFamily: 'Web', description: 'Push notification service' },

    // Comms
    { serviceName: 'Phone Numbers', serviceFamily: 'Azure Communication Services', description: 'Phone number management' },
    { serviceName: 'SMS', serviceFamily: 'Azure Communication Services', description: 'Send and receive SMS' },
];

export const AZURE_REGIONS = [
    { name: 'East US', code: 'eastus' },
    { name: 'East US 2', code: 'eastus2' },
    { name: 'West US', code: 'westus' },
    { name: 'West US 2', code: 'westus2' },
    { name: 'West US 3', code: 'westus3' },
    { name: 'Central US', code: 'centralus' },
    { name: 'North Central US', code: 'northcentralus' },
    { name: 'South Central US', code: 'southcentralus' },
    { name: 'West Central US', code: 'westcentralus' },
    { name: 'Canada Central', code: 'canadacentral' },
    { name: 'Canada East', code: 'canadaeast' },
    { name: 'Brazil South', code: 'brazilsouth' },
    { name: 'North Europe', code: 'northeurope' },
    { name: 'West Europe', code: 'westeurope' },
    { name: 'UK South', code: 'uksouth' },
    { name: 'UK West', code: 'ukwest' },
    { name: 'France Central', code: 'francecentral' },
    { name: 'Germany West Central', code: 'germanywestcentral' },
    { name: 'Switzerland North', code: 'switzerlandnorth' },
    { name: 'Norway East', code: 'norwayeast' },
    { name: 'Sweden Central', code: 'swedencentral' },
    { name: 'Italy North', code: 'italynorth' },
    { name: 'Spain Central', code: 'spaincentral' },
    { name: 'Poland Central', code: 'polandcentral' },
    { name: 'East Asia', code: 'eastasia' },
    { name: 'Southeast Asia', code: 'southeastasia' },
    { name: 'Japan East', code: 'japaneast' },
    { name: 'Japan West', code: 'japanwest' },
    { name: 'Australia East', code: 'australiaeast' },
    { name: 'Australia Southeast', code: 'australiasoutheast' },
    { name: 'Central India', code: 'centralindia' },
    { name: 'South India', code: 'southindia' },
    { name: 'West India', code: 'westindia' },
    { name: 'Korea Central', code: 'koreacentral' },
    { name: 'Korea South', code: 'koreasouth' },
    { name: 'UAE North', code: 'uaenorth' },
    { name: 'South Africa North', code: 'southafricanorth' },
    { name: 'Qatar Central', code: 'qatarcentral' },
];
