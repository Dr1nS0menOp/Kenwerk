// SPDX-License-Identifier: Apache-2.0
// Kenwerk on Azure (spec 099): Container Apps, Azure Database for PostgreSQL flexible server on
// a private network, and Azure Files for the stored files, the backups and the backup key.
// See docs/operations/deploy-azure.md. azuredeploy.json is the build of this file, for the
// "Deploy to Azure" button: bash scripts/deploy-check.sh --write-azure rebuilds it.
//
// No secret is in this file. Both database passwords are new random values at every
// deployment, which sets them on the server and in the app together; the backup key is made
// once, on its own file share, by the first start.

@description('A released version of Kenwerk, such as v0.1.0. Its images must be published and public.')
param kenwerkVersion string

@description('Name of the app, which is also the start of its address.')
@minLength(3)
@maxLength(24)
param name string = 'kenwerk'

@description('Region of every part.')
param location string = resourceGroup().location

@description('Where the images are: ghcr.io/<owner> of the repository that released them.')
param imageRegistry string = 'ghcr.io/dr1ns0menop'

@description('Machine of the database. Standard_B1ms suits a trial; give a few hundred people Standard_D2ds_v5 with the tier GeneralPurpose.')
param databaseSku string = 'Standard_B1ms'

@description('Tier of that machine: Burstable, GeneralPurpose or MemoryOptimized.')
@allowed([
  'Burstable'
  'GeneralPurpose'
  'MemoryOptimized'
])
param databaseTier string = 'Burstable'

@description('Days the database keeps its own backups, to restore to any minute in them.')
@minValue(7)
@maxValue(35)
param databaseBackupDays int = 7

// Generated at each deployment; never given by hand. Letters, digits and dashes, so each fits an
// address without escaping, and meets the database's rule of three kinds of character.
@secure()
@description('Leave as it is: a new random password at each deployment.')
param ownerPassword string = '${newGuid()}-${newGuid()}'

@secure()
@description('Leave as it is: a new random password at each deployment.')
param appPassword string = '${newGuid()}-${newGuid()}'

var suffix = uniqueString(resourceGroup().id, name)
var serverName = '${name}-db-${suffix}'
var ownerRole = 'kenwerk_owner'
var appRole = 'kenwerk_app'
var databaseName = 'kenwerk'
var databaseHost = '${serverName}.postgres.database.azure.com'
// verify-full against the system's roots: the server's certificate comes from a public CA, and
// names the host. libpq (pg_dump) reads sslrootcert=system, pgx the system's roots likewise.
var databaseQuery = 'sslmode=verify-full&sslrootcert=system'
var ownerUrl = 'postgres://${ownerRole}:${ownerPassword}@${databaseHost}:5432/${databaseName}?${databaseQuery}'
var appUrl = 'postgres://${appRole}:${appPassword}@${databaseHost}:5432/${databaseName}?${databaseQuery}'
var appsSubnetPrefix = '10.20.0.0/23'

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${name}-logs-${suffix}'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// --- Network: the apps and the database share one private network. --------------------------

resource network 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: '${name}-net'
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.20.0.0/16'
      ]
    }
    subnets: [
      {
        name: 'apps'
        properties: {
          addressPrefix: appsSubnetPrefix
          delegations: [
            {
              name: 'apps'
              properties: {
                serviceName: 'Microsoft.App/environments'
              }
            }
          ]
          serviceEndpoints: [
            {
              service: 'Microsoft.Storage'
            }
          ]
        }
      }
      {
        name: 'database'
        properties: {
          addressPrefix: '10.20.2.0/24'
          delegations: [
            {
              name: 'database'
              properties: {
                serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers'
              }
            }
          ]
        }
      }
    ]
  }
}

resource databaseZone 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: '${serverName}.private.postgres.database.azure.com'
  location: 'global'
}

resource databaseZoneLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: databaseZone
  name: 'kenwerk'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: network.id
    }
  }
}

// --- Database: no public address. -------------------------------------------------------------

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: serverName
  location: location
  sku: {
    name: databaseSku
    tier: databaseTier
  }
  properties: {
    version: '16'
    administratorLogin: ownerRole
    administratorLoginPassword: ownerPassword
    storage: {
      storageSizeGB: 32
      autoGrow: 'Enabled'
    }
    backup: {
      backupRetentionDays: databaseBackupDays
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      delegatedSubnetResourceId: network.properties.subnets[1].id
      privateDnsZoneArmResourceId: databaseZone.id
      publicNetworkAccess: 'Disabled'
    }
  }
  dependsOn: [
    databaseZoneLink
  ]
}

// Kenwerk's search needs pg_trgm (spec 047); Azure allows only the extensions named here.
resource extensions 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: server
  name: 'azure.extensions'
  properties: {
    value: 'PG_TRGM'
    source: 'user-override'
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: server
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
  dependsOn: [
    extensions
  ]
}

// --- Files: reachable only from the apps' network. --------------------------------------------

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'kw${suffix}'
  location: location
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
    networkAcls: {
      defaultAction: 'Deny'
      bypass: 'AzureServices'
      virtualNetworkRules: [
        {
          id: network.properties.subnets[0].id
          action: 'Allow'
        }
      ]
    }
  }
}

resource fileService 'Microsoft.Storage/storageAccounts/fileServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    shareDeleteRetentionPolicy: {
      enabled: true
      days: 14
    }
  }
}

// data: stored files and master.key, as the data volume of compose.yaml. backups: what the
// backup service writes. keys: the backup key, apart from the backups it opens (spec 054).
var shares = [
  'data'
  'backups'
  'keys'
]

resource share 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-05-01' = [
  for shareName in shares: {
    parent: fileService
    name: shareName
    properties: {
      shareQuota: 100
      enabledProtocols: 'SMB'
    }
  }
]

// --- The app ----------------------------------------------------------------------------------

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${name}-env'
  location: location
  properties: {
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
    vnetConfiguration: {
      infrastructureSubnetId: network.properties.subnets[0].id
      internal: false
    }
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

resource environmentStorage 'Microsoft.App/managedEnvironments/storages@2024-03-01' = [
  for (shareName, i) in shares: {
    parent: environment
    name: shareName
    properties: {
      azureFile: {
        accountName: storage.name
        accountKey: storage.listKeys().keys[0].value
        shareName: share[i].name
        accessMode: 'ReadWrite'
      }
    }
  }
]

var publicUrl = 'https://${name}.${environment.properties.defaultDomain}'

// Read by the init step and the backup service, as the files the backup service expects.
var ownerSecretFiles = [
  {
    secretRef: 'database-url'
    path: 'database_url'
  }
  {
    secretRef: 'migrate-database-url'
    path: 'migrate_database_url'
  }
]

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  properties: {
    environmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
        allowInsecure: false
      }
      secrets: [
        {
          name: 'database-url'
          // appUrl is built from the secure parameter appPassword; a variable cannot be marked so.
          #disable-next-line use-secure-value-for-secure-inputs
          value: appUrl
        }
        {
          name: 'migrate-database-url'
          // ownerUrl is built from the secure parameter ownerPassword, as above.
          #disable-next-line use-secure-value-for-secure-inputs
          value: ownerUrl
        }
      ]
    }
    template: {
      initContainers: [
        {
          // Makes the backup key once, then the application role (spec 099).
          name: 'prepare'
          image: '${imageRegistry}/kenwerk-backup:${kenwerkVersion}'
          command: [
            'bash'
            '-c'
            'set -eu; umask 077; [ -s /key/backup.key ] || head -c 32 /dev/urandom | base64 >/key/backup.key; exec bash /usr/local/bin/kenwerk-backup app-role'
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            {
              name: 'KENWERK_DATABASE_URL_FILE'
              value: '/run/secrets/kenwerk/database_url'
            }
            {
              name: 'KENWERK_MIGRATE_DATABASE_URL_FILE'
              value: '/run/secrets/kenwerk/migrate_database_url'
            }
          ]
          volumeMounts: [
            {
              volumeName: 'owner-secrets'
              mountPath: '/run/secrets/kenwerk'
            }
            {
              volumeName: 'keys'
              mountPath: '/key'
            }
          ]
        }
      ]
      containers: [
        {
          name: 'kenwerk'
          image: '${imageRegistry}/kenwerk:${kenwerkVersion}'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'KENWERK_ROLE'
              value: 'all'
            }
            {
              name: 'KENWERK_PUBLIC_URL'
              value: publicUrl
            }
            {
              // The server holds only the application role; the backup service migrates
              // (spec 070), and the server waits on its page until it did.
              name: 'KENWERK_DATABASE_URL_FILE'
              value: '/run/secrets/kenwerk/database_url'
            }
            {
              name: 'KENWERK_MIGRATE_ON_START'
              value: 'false'
            }
            {
              // Only the platform's ingress, in the apps' subnet, reaches the app.
              name: 'KENWERK_TRUSTED_PROXIES'
              value: appsSubnetPrefix
            }
          ]
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: '/livez'
                port: 8080
              }
              periodSeconds: 5
              failureThreshold: 60
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/livez'
                port: 8080
              }
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/readyz'
                port: 8080
              }
            }
          ]
          volumeMounts: [
            {
              volumeName: 'data'
              mountPath: '/var/lib/kenwerk'
            }
            {
              // The embedded queue keeps its files on the replica's own disk: during a new
              // revision two replicas run for a moment, and two queues must never share files.
              volumeName: 'queue'
              mountPath: '/var/lib/kenwerk/nats'
            }
            {
              volumeName: 'app-secrets'
              mountPath: '/run/secrets/kenwerk'
            }
          ]
        }
        {
          // The backup service of compose.yaml (spec 054): backups every 4 hours, the
          // migrations of a new release, and the audit checkpoints (spec 070).
          name: 'backup'
          image: '${imageRegistry}/kenwerk-backup:${kenwerkVersion}'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            {
              name: 'KENWERK_DATABASE_URL_FILE'
              value: '/run/secrets/kenwerk/database_url'
            }
            {
              name: 'KENWERK_MIGRATE_DATABASE_URL_FILE'
              value: '/run/secrets/kenwerk/migrate_database_url'
            }
            {
              name: 'KENWERK_DATA_DIR'
              value: '/data'
            }
            {
              name: 'KENWERK_BACKUP_INTERVAL'
              value: '4h'
            }
            {
              name: 'KENWERK_BACKUP_KEEP'
              value: '42'
            }
          ]
          volumeMounts: [
            {
              volumeName: 'data'
              mountPath: '/data'
            }
            {
              volumeName: 'backups'
              mountPath: '/backups'
            }
            {
              volumeName: 'keys'
              mountPath: '/key'
            }
            {
              volumeName: 'owner-secrets'
              mountPath: '/run/secrets/kenwerk'
            }
            {
              // A backup packs /secrets; here the secrets live in the platform, so it is empty.
              volumeName: 'no-secret-files'
              mountPath: '/secrets'
            }
          ]
        }
      ]
      // One replica: Kenwerk is sized for one node (docs/operations/install.md).
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
      volumes: [
        {
          name: 'data'
          storageType: 'AzureFile'
          storageName: environmentStorage[0].name
          // The server runs as user 65532, and master.key must be its own.
          mountOptions: 'uid=65532,gid=65532,dir_mode=0700,file_mode=0600'
        }
        {
          name: 'backups'
          storageType: 'AzureFile'
          storageName: environmentStorage[1].name
          mountOptions: 'dir_mode=0700,file_mode=0600'
        }
        {
          name: 'keys'
          storageType: 'AzureFile'
          storageName: environmentStorage[2].name
          mountOptions: 'dir_mode=0700,file_mode=0600'
        }
        {
          name: 'queue'
          storageType: 'EmptyDir'
        }
        {
          name: 'no-secret-files'
          storageType: 'EmptyDir'
        }
        {
          name: 'app-secrets'
          storageType: 'Secret'
          secrets: [
            {
              secretRef: 'database-url'
              path: 'database_url'
            }
          ]
        }
        {
          name: 'owner-secrets'
          storageType: 'Secret'
          secrets: ownerSecretFiles
        }
      ]
    }
  }
  dependsOn: [
    database
  ]
}

@description('The address of the wiki. Open /setup there with the code from the log.')
output url string = publicUrl

@description('Prints the line of the log with the one-time setup code.')
output setupCodeCommand string = 'az containerapp logs show --name ${name} --resource-group ${resourceGroup().name} --container kenwerk --tail 300 | grep "first setup"'
