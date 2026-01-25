// Azure Container Apps deployment for Banxway Backend
// Deploy with: az deployment group create --resource-group banxway-platform-prod --template-file main.bicep --parameters main.parameters.json
//
// NOTE: Zoho Mail, Exotel, and WhatsApp credentials are managed at runtime
// through the admin UI and stored in the database - NOT during deployment.

@description('Location for all resources')
param location string = resourceGroup().location

@description('Environment name (staging or production)')
@allowed(['staging', 'production'])
param environment string = 'production'

@description('Container image to deploy')
param containerImage string

@description('Supabase URL')
@secure()
param supabaseUrl string

@description('Supabase Anon Key')
@secure()
param supabaseAnonKey string

@description('Supabase Service Role Key')
@secure()
param supabaseServiceRoleKey string

@description('Redis connection string')
@secure()
param redisUrl string

@description('Frontend URL for CORS')
param frontendUrl string

@description('JWT Secret for authentication')
@secure()
param jwtSecret string

@description('ACR Server')
param acrServer string = 'banxwayacr.azurecr.io'

@description('ACR Username')
param acrUsername string = 'banxwayacr'

@description('ACR Password')
@secure()
param acrPassword string

// Use simpler naming for production (banxway-api instead of banxway-production-api)
var containerAppName = environment == 'production' ? 'banxway-api' : 'banxway-${environment}-api'
var containerAppEnvName = 'banxway-${environment}-env'
var logAnalyticsName = 'banxway-${environment}-logs'

// Log Analytics Workspace
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// Container Apps Environment
resource containerAppEnv 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: containerAppEnvName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// Container App
resource containerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: containerAppName
  location: location
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8000
        transport: 'http'
        corsPolicy: {
          allowedOrigins: [
            frontendUrl
            'https://*.vercel.app'
            'http://localhost:3000'
          ]
          allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
          allowedHeaders: ['*']
          allowCredentials: true
        }
      }
      registries: [
        {
          server: acrServer
          username: acrUsername
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        { name: 'supabase-url', value: supabaseUrl }
        { name: 'supabase-anon-key', value: supabaseAnonKey }
        { name: 'supabase-service-role-key', value: supabaseServiceRoleKey }
        { name: 'redis-url', value: redisUrl }
        { name: 'jwt-secret', value: jwtSecret }
        { name: 'acr-password', value: acrPassword }
      ]
    }
    template: {
      containers: [
        {
          name: 'banxway-api'
          image: containerImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            // Core settings
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '8000' }
            { name: 'WS_PORT', value: '8002' }
            { name: 'CORS_ORIGIN', value: frontendUrl }

            // Supabase
            { name: 'SUPABASE_URL', secretRef: 'supabase-url' }
            { name: 'SUPABASE_ANON_KEY', secretRef: 'supabase-anon-key' }
            { name: 'SUPABASE_SERVICE_ROLE_KEY', secretRef: 'supabase-service-role-key' }

            // Redis
            { name: 'REDIS_URL', secretRef: 'redis-url' }

            // Auth
            { name: 'JWT_SECRET', secretRef: 'jwt-secret' }

            // Runtime-configured integrations flag
            // Zoho Mail, Exotel, WhatsApp credentials are stored in DB
            // and configured via Admin UI at runtime
            { name: 'USE_DATABASE_CREDENTIALS', value: 'true' }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/api/v1/health'
                port: 8000
              }
              initialDelaySeconds: 30
              periodSeconds: 30
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/api/v1/health'
                port: 8000
              }
              initialDelaySeconds: 10
              periodSeconds: 10
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 5
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

// Outputs
output containerAppUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output containerAppName string = containerApp.name
output containerAppEnvironment string = containerAppEnv.name
