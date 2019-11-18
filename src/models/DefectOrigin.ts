import { Entity, OneToOne, JoinColumn } from "typeorm";
import { MachineType } from "./MachineType";
import { CrudClass } from "./CrudClass";

@Entity("default_origin")
export class DefectOrigin extends CrudClass {

  @OneToOne(
    (type) => MachineType,
    (machineType) => machineType.getId,
    { nullable: false },
  )
  @JoinColumn()
  private machineType: MachineType;

  constructor() {
    super();
  }

  /**
   * Getter machineType
   * @return {MachineType }
   */
	public getMachineType(): MachineType  {
		return this.machineType;
	}

  /**
   * Setter machineType
   * @param {MachineType } value
   */
	public setMachineType(value: MachineType ) {
		this.machineType = value;
	}

}