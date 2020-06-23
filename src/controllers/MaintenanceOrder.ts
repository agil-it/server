import { OrderEquipmentController } from './OrderEquipment';
import { OrderSignatureController } from './OrderSignature';
import { MaintenanceWorkerController } from './MaintenanceWorker';
import { getRepository, Repository, SelectQueryBuilder } from "typeorm";
import { validate } from "class-validator";
import { MaintenanceOrder } from "../models/maintenance-order/MaintenanceOrder";
import { NextFunction, Request, Response } from "express";
import * as jwt from "jsonwebtoken";
import JWT from "../config/JWT";
import { MaintenanceWorker } from "../models/maintenance-order/MaintenanceWorker";
import { getIntegrionUser } from '../middlewares/checkJwt';
import { User } from "../models/User";
import { v4 as uuid } from 'uuid';
export class MaintenanceOrderController {

  private repositoryEntity : Repository<MaintenanceOrder>;

  constructor() {
    this.repositoryEntity = getRepository(MaintenanceOrder)
  }

	public getRepositoryEntity(): Repository<MaintenanceOrder> {
		return this.repositoryEntity;
  }

  public async all(request: Request, response: Response, next: NextFunction) {

    const where = {
      deleted: false,
      ...this.getWhereConditions(request.params, request.query, this.getRepositoryEntity().create()),
    };

    const arrayOfOrders = await this.getRepositoryEntity().find({
      select: <any>this.fieldsResume(),
      relations: ['orderLayout', 'orderEquipment', 'orderEquipment.equipment', 'maintenanceWorker', 'maintenanceWorker.user'],
      where,
    });

    return arrayOfOrders.map((order) => this.removeProperties(order, this.fieldsToIgnoreResume()));
  }

  public async getOrder(request: Request, response: Response, next: NextFunction) {
    let orderId = request.params.id;

    return this.getRepositoryEntity().findOne({
      relations: this.getAllRelations(),
      where: { id: orderId }
    });
  }
  
  public async createOrder(request: Request, response: Response, next: NextFunction) {
    const order = this.getRepositoryEntity().create(<MaintenanceOrder>request.body);

    const token = <string>request.headers["token"];
    const authorization = <string>request.headers["authorization"];

    await this.updateFields(token, authorization, order);

    return await this.saveOrder(order)

  }
  
  public async updateOrder(request: Request, response: Response, next: NextFunction) {
    let order: MaintenanceOrder

    try {
      order = await this.getRepositoryEntity().findOneOrFail(request.params.id,{ relations: [...this.getOrderRelations()]});
      order = this.getRepositoryEntity().merge(order, request.body)
    } catch (error) {
      throw `Ordem ${request.params.id} não encontrada`;
    }

    const token = <string>request.headers["token"];
    const authorization = <string>request.headers["authorization"];

    await this.updateFields(token, authorization, order);

    return await this.saveOrder(order)
    
  }
  
  public async saveOrder(order: MaintenanceOrder) {

    //Validade if the parameters are ok
    const error = await this.validate(order)
    if (error !== undefined) {
      throw error;
    }
    
    const isInserting = typeof order['id'] !== 'number'

    if (order["integrationID"] != '' && isInserting) {

      try {
        const integrationId = order["integrationID"];
        await this.getRepositoryEntity().findOneOrFail({
          where: {
            integrationID: integrationId,
            deleted: false,
          }
        });

        throw `Registro com o integrationID ${integrationId} já existe.`;
      } catch (error) {
        if (typeof error === "string" && error.substr(0,28) === "Registro com o integrationID") {
          throw error;
        }
      }
    }

    const preSave = await this.preSave(order, isInserting)

    let orderSaved: MaintenanceOrder;

    orderSaved = await this.getRepositoryEntity().save(order);
    await this.posSave(orderSaved, isInserting, preSave)

    return await this.getRepositoryEntity().findOne(orderSaved["id"], {
      relations: this.getAllRelations(),
    });
  }

  public async deleteOrder(request: Request, response: Response, next: NextFunction) {
    let order: MaintenanceOrder

    try {
      order = await this.getRepositoryEntity().findOneOrFail(request.params.id, {relations: this.getAllRelations()});
    } catch (error) {
      throw `Ordem ${request.params.id} não encontrada`;
    }

    if (order["deleted"] === true) {
      throw `Ordem ${request.params.id} já está excluída`;
    }

    const token = <string>request.headers["token"];
    const authorization = <string>request.headers["authorization"];

    await this.updateFields(token, authorization, order);

    order["deleted"] = true;
    
    if (order["integrationID"] != "") {
      order["integrationID"] = `${order['integrationID']}-uuid-${uuid()}`
    }

    const errors = await validate(order);
    if (errors.length > 0) {
      throw errors;
    }

    let result = await this.getRepositoryEntity().save(order)
    if (!result) throw "Erro ao deletar a ordem";

    order.maintenanceWorker.forEach((maintenanceWorker: MaintenanceWorker) => {
      const maintenanceOrderController = new MaintenanceOrderController()
    })

    return await this.getRepositoryEntity().findOne(request.params.id);
  }

  public async getOrdersByMaintener(request: Request, response: Response, next: NextFunction) {
    // route: order-mainteners/:id/orders

    let maintenerId = request.params.id;
    const where = {
      deleted: false,
      ...this.getWhereConditions({}, request.query, this.getRepositoryEntity().create()),
    }

    const arrayOfOrders = await this.getRepositoryEntity().find({
      select: <any>this.fieldsResume(),
      join: {
        alias: 'order',
        leftJoin: {
          maintenanceWorker: 'order.maintenanceWorker',
        },
        leftJoinAndSelect: {
          maintenanceEquipment: 'order.orderEquipment',
          orderLayout: 'order.orderLayout',
          equipment : 'maintenanceEquipment.equipment',
        }
      },
      where: (qb: SelectQueryBuilder<MaintenanceOrder>) => {
        qb.where({
          where,
        }).andWhere('maintenanceWorker.userId = :id', {id: maintenerId});
      }
    });

    return arrayOfOrders.map((order) => this.removeProperties(order, this.fieldsToIgnoreResume()))
  }

  public async getOrderMainteners(request: Request, response: Response, next: NextFunction) {
    // route: maintenance-orders/:id/mainteners
    const orderId = request.params.id;

    return this.getRepositoryEntity().findOne({
      select: ['maintenanceWorker'],
      relations: this.getMaintenanceWorkerRelations(),
      where: { id: orderId }
    });
  }
  
  public async getOrderSignatures(request: Request, response: Response, next: NextFunction) {
    // route: maintenance-orders/:id/signatures
    const orderId = request.params.id;
  }

  public getWhereConditions(params: any = {}, query: any = {}, entity: any) {

    let filterObject = {};

    const entries = {
      ...query,
      ...params,
    };

    const keys = Object.keys(entries);

    keys.forEach(key => {

      let keyProperty = '';

      if(key.length > 2 && key.substr(key.length-2,2) == 'Id') {
        keyProperty=key.substr(0,key.length-2)
      } else {
        keyProperty=key
      }

      if (entity.hasOwnProperty(keyProperty)) {
        filterObject[keyProperty]=entries[key];
      }
    });

    return filterObject;
  }

  async updateFields(token:string, authorization:string, entity :MaintenanceOrder) {

    let userId;

    if (token) {
      let jwtPayload = <any>jwt.verify(token, JWT.jwtSecret);
      userId = jwtPayload.userId;
    } else {
      const user:User = await getIntegrionUser(authorization)
      userId= user.id;
    }
    
    entity["updatedBy"] = userId;
    if (entity["createdBy"] === undefined) {
      entity["createdBy"] = userId;
    }
  }

  async validate(entity: MaintenanceOrder) : Promise<any> {
    const errors = await validate(entity);

    if (errors.length === 0) {
      return undefined
    }
    
    let errorList = []

    errors.forEach(error => {
      let constraints = error.constraints

      for (const key in constraints) {
        if (constraints.hasOwnProperty(key)) {
          errorList.push(constraints[key])
        }
      }
    });

    return errorList
  }

  public fieldsResume() {
    return [
      'id',
      'description',
      'orderNumber',
      'openedDate',
      'priority',
      'orderStatus',
      'orderLayout',
    ];
  }
  
  public fieldsToIgnoreResume() {
    return [
      'integrationID',
      'deleted',
      'needStopping',
      'isStopped',
      'exported',
    ];
  }

  public getAllRelations() {
    return [
      ...this.getOrderRelations(),
      ...this.getMaintenanceWorkerRelations(),
      ...this.getOrderEquipmentRelations(),
      ...this.getOrderSignatureRelations(),
    ];
  }

  public getOrderRelations() {
    return [
      'workCenter',
      'orderLayout',
      'solicitationUser',
    ];
  }

  public getMaintenanceWorkerRelations() {
    return [
      'maintenanceWorker',
      'maintenanceWorker.user',
      'maintenanceWorker.workedTime',
      'maintenanceWorker.workerRequest',
      'maintenanceWorker.workerRequest.requestedBy',
    ];
  }
  
  public getOrderEquipmentRelations() {
    return [
      'orderEquipment',
      'orderEquipment.defectOrigin',
      'orderEquipment.defectSymptom',
      'orderEquipment.equipment',
      'orderEquipment.equipment.machineType',
      'orderEquipment.superiorEquipment',
      'orderEquipment.installationArea',
      ...this.getOrderOperationsRelations(),
    ];
  }

  public getOrderOperationsRelations() {
    return [
      'orderEquipment.orderOperation',
      'orderEquipment.orderOperation.defaultObservation',
      'orderEquipment.orderOperation.orderComponent',
      'orderEquipment.orderOperation.orderComponent.item',
    ];
  }

  public getOrderSignatureRelations() {
    return [
      "orderSignature",
      "orderSignature.user",
    ];
  }

  public removeProperties(order: MaintenanceOrder, propertiesExclude: Array<string>) {
    propertiesExclude.forEach(property => {
      if (order.hasOwnProperty(property)) {
        delete order[property];
      }
    });

    return order;
  }
  
  /**
    @param { MaintenanceOrder } order entidade que está sendo salva
    @param { boolean } isInserting se está inserindo recebe true, se estivar alterando recebe false
  */
  public async preSave(order: MaintenanceOrder, isInserting: boolean) {
    return this.getAndRemoveSubTables(order)
  }


  /**
    @param { MaintenanceOrder } order entidade que está sendo salva
    @param { boolean } isInserting se está inserindo recebe true, se estivar alterando recebe false
    @param { any } preSave retorno do método preSave
  */
  public async posSave(order: MaintenanceOrder, isInserting: boolean, preSave: any) {
    const userId = order['updatedBy'];
    const subTables = this.mountSubTablesData(preSave)

    for (let index = 0; index < subTables.length; index++) {
      const table = subTables[index];

      const { data } = table;
      const controller = table.instance()

      if (!Array.isArray(data)) continue;

      for (let i = 0; i < data.length; i++) {
        const obj = data[i];
        
        if (typeof obj !== 'object' || obj === null) continue

        obj['updatedBy'] = userId;
        if (obj['createdBy'] === undefined) {
          obj['createdBy'] = userId;
        }

        obj['maintenanceOrder'] = order;

        await controller.saveEntity(obj)
      }
    };
  }


  /**
    @param { MaintenanceOrder } order entidade que está sendo deletado
  */
  public async preDelete(order: MaintenanceOrder) {
    return this.getAndRemoveSubTables(order)
  }

  /**
    @param { MaintenanceOrder } order entidade que está sendo deletado
    @param { any } preDelete retorno do método preDelete
  */
  public async posDelete(order: MaintenanceOrder, preDelete: any) {
    /*
    const userId = order['updatedBy'];
    const subTables = this.mountSubTablesData(preDelete)

    subTables.forEach(async (table: any) => {
      
      const { data } = table;
      const controller = table.instance()

      if (!Array.isArray(data)) return;

      for (let i = 0; i < data.length; i++) {
        const obj = data[i];
        
        obj['updatedBy'] = userId;

        await controller.removeEntity(obj)
      }

    });
    /**/
  }

  public getAndRemoveSubTables(order: MaintenanceOrder) {
    const { maintenanceWorker, orderSignature, orderEquipment } = order;

    delete order['orderSignature'];
    delete order['orderEquipment'];
    delete order['maintenanceWorker'];

    return {
      orderSignature,
      orderEquipment,
      maintenanceWorker,
    };
  }

  public mountSubTablesData(subTables) {
    const { maintenanceWorker, orderSignature, orderEquipment } = subTables;

    return [
      {
        'instance': () => new MaintenanceWorkerController(),
        'data': maintenanceWorker,
      },
      {
        'instance': () => new OrderSignatureController(),
        'data': orderSignature,
      },
      {
        'instance': () => new OrderEquipmentController(),
        'data': orderEquipment,
      },
    ];
  }
}