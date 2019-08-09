const aws = require('aws-sdk')
const { reduce, head, isNil, map, merge, not } = require('ramda')
const { utils } = require('@serverless/core')

const getClients = (credentials, region = 'us-east-1') => {
  const cloudformation = new aws.CloudFormation({ credentials, region })
  const s3 = new aws.S3({ credentials, region })
  return {
    cloudformation,
    s3
  }
}

const needsUpdate = async (cloudformation, config) => {
  let deployedTemplate = ''
  try {
    deployedTemplate = await cloudformation
      .getTemplate({ StackName: config.stackName, TemplateStage: 'Original' })
      .promise()
    exists = true
  } catch (error) {
    if (error.message !== `Stack with id ${config.stackName} does not exist`) {
      throw error
    }
    return true
  }
  if (deployedTemplate.TemplateBody === JSON.stringify(config.template)) {
    return false
  }
  return true
}

const constructTemplateS3Key = (config) => {
  return `${config.stackName}/${config.timestamp}-${new Date(
    config.timestamp
  ).toISOString()}/template.json`
}

const uploadTemplate = async (s3, config) => {
  await s3
    .putObject({
      Bucket: config.bucket,
      Key: config.templateS3Key,
      Body: JSON.stringify(config.template),
      ContentEncoding: 'application/json',
      ACL: 'bucket-owner-full-control'
    })
    .promise()
}

const createOrUpdateStack = async (cloudformation, config) => {
  let deployedTemplate = ''
  let exists = false
  try {
    deployedTemplate = await cloudformation
      .getTemplate({ StackName: config.stackName, TemplateStage: 'Original' })
      .promise()
    exists = true
  } catch (error) {
    if (error.message !== `Stack with id ${config.stackName} does not exist`) {
      throw error
    }
  }
  if (deployedTemplate.TemplateBody === JSON.stringify(config.template)) {
    return
  }
  const params = {
    StackName: config.stackName,
    Capabilities: config.capabilities,
    // EnableTerminationProtection: config.enableTerminationProtection, cloudformation.updateTerminationProtection <- move here
    RoleARN: config.role,
    RollbackConfiguration: config.rollbackConfiguration,
    Parameters: config.parameters,
    TemplateURL: `https://s3.amazonaws.com/${config.bucket}/${config.templateS3Key}`
  }
  if (!exists) {
    await cloudformation.createStack(params).promise()
  } else {
    try {
      await cloudformation.updateStack(params).promise()
    } catch (error) {
      if (error.message !== 'No updates are to be performed.') {
        throw error
      }
    }
  }

  const stacks = await waitFor(
    cloudformation,
    exists ? 'UPDATE_COMPLETE' : 'CREATE_COMPLETE',
    config
  )

  return stackOutputsToObject(head(stacks).Outputs)
}

const waitFor = async (cloudformation, event, config) =>
  new Promise(async (resolve, reject) => {
    let inProgress = true
    do {
      try {
        const { Stacks } = await cloudformation
          .describeStacks({ StackName: config.stackName })
          .promise()
        if (head(Stacks).StackStatus === event) {
          return resolve(Stacks)
        } else {
          await utils.sleep(5000)
        }
      } catch (error) {
        return reject(error)
      }
    } while (inProgress)
  })

const fetchOutputs = async (cloudformation, config) => {
  const { Stacks } = await cloudformation.describeStacks({ StackName: config.stackName }).promise()
  return stackOutputsToObject(head(Stacks).Outputs)
}

const stackOutputsToObject = (outputs) =>
  reduce((acc, { OutputKey, OutputValue }) => merge(acc, { [OutputKey]: OutputValue }), {}, outputs)

const deleteStack = async (cloudformation, config) => {
  try {
    await cloudformation.deleteStack({ StackName: config.stackName }).promise()
    return await waitFor(cloudformation, 'DELETE_COMPLETE', config)
  } catch (error) {
    if (error.message !== `Stack with id ${config.stackName} does not exist`) {
      throw error
    }
  }
}

const deleteBucket = async (s3, config) => {
  let nextToken
  try {
    do {
      const { NextContinuationToken, Contents } = await s3
        .listObjectsV2({ Bucket: config.bucket, ContinuationToken: nextToken })
        .promise()
      await s3
        .deleteObjects({
          Bucket: config.bucket,
          Delete: {
            Objects: map(({ Key, VersionId }) => ({ Key, VersionId }), Contents),
            Quiet: false
          }
        })
        .promise()
      nextToken = NextContinuationToken
    } while (not(isNil(nextToken)))
    return await s3.deleteBucket({ Bucket: config.bucket }).promise()
  } catch (error) {
    if (error.statusCode !== 404) {
      throw error
    }
  }
}

module.exports = {
  needsUpdate,
  fetchOutputs,
  deleteStack,
  deleteBucket,
  createOrUpdateStack,
  constructTemplateS3Key,
  getClients,
  uploadTemplate
}
