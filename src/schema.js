const YAML = require('js-yaml')
const { flatten, includes, is, map, split, take } = require('ramda')

const functionNames = [
  'And',
  'Base64',
  'Cidr',
  'Condition',
  'Equals',
  'FindInMap',
  'GetAtt',
  'GetAZs',
  'If',
  'ImportValue',
  'Join',
  'Not',
  'Or',
  'Ref',
  'Select',
  'Split',
  'Sub'
]

const yamlType = (name, kind) => {
  const functionName = includes(name, ['Ref', 'Condition']) ? name : `Fn::${name}`
  return new YAML.Type(`!${name}`, {
    kind,
    construct: (data) => {
      if (name === 'GetAtt') {
        // special GetAtt dot syntax
        return { [functionName]: is(String, data) ? take(2, split('.', data)) : data }
      }
      return { [functionName]: data }
    }
  })
}

const createSchema = () => {
  const types = flatten(
    map(
      (functionName) =>
        map((kind) => yamlType(functionName, kind), ['mapping', 'scalar', 'sequence']),
      functionNames
    )
  )
  return YAML.Schema.create(types)
}

module.exports = {
  schema: createSchema()
}
