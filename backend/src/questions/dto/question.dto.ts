import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Difficulty, QuestionSourceType, QuestionType } from '@prisma/client';

export class QuestionOptionInputDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  textEn?: string;

  @IsOptional()
  @IsString()
  textHi?: string;

  @IsOptional()
  @IsBoolean()
  isCorrect?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class CreateQuestionDto {
  @IsOptional()
  @IsString()
  examId?: string;

  @IsOptional()
  @IsString()
  examCycleId?: string;

  @IsOptional()
  @IsString()
  syllabusVersionId?: string;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsString()
  topicId?: string;

  @IsOptional()
  @IsString()
  subTopicId?: string;

  @IsOptional()
  @IsEnum(QuestionSourceType)
  source?: QuestionSourceType;

  @IsOptional()
  @IsString()
  sourceReference?: string;

  @IsOptional()
  @IsEnum(QuestionType)
  type?: QuestionType;

  @IsOptional()
  @IsEnum(Difficulty)
  difficulty?: Difficulty;

  @IsOptional()
  @IsNumber()
  @Min(0)
  marks?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  negativeMarks?: number;

  @IsOptional()
  @IsString()
  textEn?: string;

  @IsOptional()
  @IsString()
  textHi?: string;

  @IsOptional()
  @IsString()
  explanationEn?: string;

  @IsOptional()
  @IsString()
  explanationHi?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionInputDto)
  options!: QuestionOptionInputDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];
}

export class UpdateQuestionDto {
  @IsOptional()
  @IsString()
  examId?: string;

  @IsOptional()
  @IsString()
  examCycleId?: string;

  @IsOptional()
  @IsString()
  syllabusVersionId?: string;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsString()
  topicId?: string;

  @IsOptional()
  @IsString()
  subTopicId?: string;

  @IsOptional()
  @IsEnum(QuestionSourceType)
  source?: QuestionSourceType;

  @IsOptional()
  @IsString()
  sourceReference?: string;

  @IsOptional()
  @IsEnum(QuestionType)
  type?: QuestionType;

  @IsOptional()
  @IsEnum(Difficulty)
  difficulty?: Difficulty;

  @IsOptional()
  @IsNumber()
  @Min(0)
  marks?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  negativeMarks?: number;

  @IsOptional()
  @IsString()
  textEn?: string;

  @IsOptional()
  @IsString()
  textHi?: string;

  @IsOptional()
  @IsString()
  explanationEn?: string;

  @IsOptional()
  @IsString()
  explanationHi?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionInputDto)
  options?: QuestionOptionInputDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];
}

export class ImportQuestionRowDto extends CreateQuestionDto {
  @IsInt()
  @Min(2)
  rowNumber!: number;
}

export class ImportQuestionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ImportQuestionRowDto)
  questions!: ImportQuestionRowDto[];
}
