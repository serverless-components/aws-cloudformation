const aws = require('aws-sdk')
const { reduce, head, isNil, equals, map, merge, not, toPairs } = require('ramda')
const { utils } = require('@serverless/core')

const getClients = (credentials, region = 'us-east-1') => {
  const cloudformation = new aws.CloudFormation({ credentials, region })
  const s3 = new aws.S3({ credentials, region })
  return {
    cloudformation,
    s3
  }
}

const getPreviousStack = async (cloudformation, config) => {
  let previousTemplate
  let stack

  try {
    previousTemplate = await cloudformation
      .getTemplate({ StackName: config.stackName, TemplateStage: 'Original' })
      .promise()
  } catch (error) {
    if (error.message !== `Stack with id ${config.stackName} does not exist`) {
      throw error
    }
  }

  if (isNil(previousTemplate)) {
    return {
      stack: {},
      needsUpdate: true
    }
  }

  try {
    const { Stacks } = await cloudformation
      .describeStacks({ StackName: config.stackName })
      .promise()
    stack = head(Stacks)
  } catch (error) {
    if (error.message !== `Stack with id ${config.stackName} does not exist`) {
      throw error
    }
  }

  const previousParameters = reduce(
    (acc, { ParameterKey, ParameterValue }) => merge(acc, { [ParameterKey]: ParameterValue }),
    {},
    stack.Parameters
  )

  if (
    equals(previousTemplate.TemplateBody, JSON.stringify(config.template)) &&
    equals(previousParameters, config.parameters)
  ) {
    return {
      stack,
      needsUpdate: false
    }
  }

  return {
    stack,
    needsUpdate: true
  }
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

const createOrUpdateStack = async (cloudformation, config, exists) => {
  const params = {
    StackName: config.stackName,
    Capabilities: config.capabilities,
    RoleARN: config.role,
    RollbackConfiguration: config.rollbackConfiguration,
    Parameters: map(
      ([key, value]) => ({
        ParameterKey: key,
        ParameterValue: value
      }),
      toPairs(config.parameters)
    ),
    TemplateURL: `https://s3.amazonaws.com/${config.bucket}/${config.templateS3Key}`
  }
  if (not(exists)) {
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

const updateTerminationProtection = async (
  cloudformation,
  config,
  terminationProtectionEnabled
) => {
  if (not(equals(terminationProtectionEnabled, config.enableTerminationProtection))) {
    await cloudformation
      .updateTerminationProtection({
        EnableTerminationProtection: config.enableTerminationProtection,
        StackName: config.stackName
      })
      .promise()
  }
}

module.exports = {
  getPreviousStack,
  fetchOutputs,
  deleteStack,
  deleteBucket,
  createOrUpdateStack,
  constructTemplateS3Key,
  getClients,
  uploadTemplate,
  updateTerminationProtection
}
