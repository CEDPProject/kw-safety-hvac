import { Entity, PrimaryGeneratedColumn, Column, OneToOne } from "typeorm";
import { Device } from "./Device";

@Entity("TB_DEVICE_MODEL")
export class DeviceModel {
  @PrimaryGeneratedColumn({ name: "idx" })
  idx!: number;

  @Column()
  device_model!: string;

  @OneToOne(() => Device, (device) => device.device_model)
  device!: Device;
}
