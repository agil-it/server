import { Between, In, Like, FindOperator, Connection } from "typeorm";

export function getValueWhereConditions(arg: string = '') {
  if (arg.substring(0,7).toLowerCase() === 'between') {
    const values = arg.substring(7).replace(/[\(\)]/g, '').split(',')

    if (values[0] == values[1]) {
      return values[0];
    } else {
      return Between(values[0], values[1]);
    }

  } else if(arg.substring(0,3).toLowerCase() === 'in(') {
    const value = arg.substring(3).replace(')', '').split(',')
    return In(value);

  } else if (arg.substring(0,5).toLowerCase() === 'like(') {
    const value = arg.substring(5).replace(')', '')
    return Like(`%${value}%`);
  } else {
    return arg;
  }
}

export function normalizeOrmKeyValue(obj, base) {
  return Object.keys(obj)
    .reduce((clone, key) => {
      key.split('.').reduce((innerObj, innerKey, i, arr) => 
        innerObj[innerKey] = (i+1 === arr.length) ? obj[key] : innerObj[innerKey] || {}, clone)
      return clone;
  }, Object.assign({}, base));
}

export function flat(array: Array<any>) {
  return array.reduce((acc, val) => acc.concat(val), []);
}

export function mountExtraConditions(connection: Connection, prop: any, value: any) {
  const strValue = String(value);
  const whereCondition = getValueWhereConditions(strValue);

  if (whereCondition instanceof FindOperator)
    return whereCondition.toSql(connection, prop, treatFindOperatorValue(whereCondition));
  
  const propVarName = dotStructureToCamelCase(String(prop));
  return { key: `${prop} = :${propVarName}`, value: { [propVarName]: value } };
}

function dotStructureToCamelCase(str: string) {
  return str.replace(/\.([a-zA-Z])/g, (g) => g[1].toUpperCase());
}

function treatFindOperatorValue(FindOperator: FindOperator<any>): Array<any> {
  const value = FindOperator.value;

  if (Array.isArray(value)) {
    return value.map(val => safeString(val));
  }

  return [safeString(value)];
}

function safeString(str: any) {
  if (typeof str === 'string') return `'${str}'`;
  return str;
}

export function filterDeleteds(data) {
  if (Array.isArray(data)) return filterDeletedsArray(data);
  return filterDeletedsObject(data);
}

function filterDeletedsArray(arrayData) {
  return arrayData.reduce((currentValue, data) => {

    if (!arrayOrObject(data)) return currentValue;

    const value = filterDeleteds(data);

    if (!arrayOrObject(value) || (isObject(value) && Object.keys(value).length === 0)) {
      return currentValue;
    }

    currentValue.push(value);
    return currentValue;
  }, []);
}

function filterDeletedsObject(objectData) {
  if (!isObject(objectData) || objectData['deleted']) return undefined;

  const entries = Object.entries(objectData);

  const data = {};

  for (const [key, value] of entries) {
    if (!arrayOrObject(value)) {
      data[key] = value;
    } else {
      data[key] = filterDeleteds(value);
    }
  }

  return data;
}

export function changeValuePerKey(object: object) {
  const newObj = {};

  for (const [key, value] of Object.entries(object)) {
    newObj[value] = key;
  }

  return newObj;
}

export function arrayOrObject(value) {
  return Array.isArray(value) || isObject(value);
}

export function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)
}