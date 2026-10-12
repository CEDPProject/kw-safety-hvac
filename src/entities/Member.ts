import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity("TB_MEMBER")
export class Member {
  @PrimaryGeneratedColumn({ name: "idx" })
  idx!: number;

  @Column()
  user_id!: string;
}
