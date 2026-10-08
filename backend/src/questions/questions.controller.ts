import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { QuestionsService } from './questions.service';
import {
  CreateQuestionDto,
  ImportQuestionsDto,
  UpdateQuestionDto,
} from './dto/question.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PaginationDto } from '../common/dto/pagination.dto';

@Roles(Role.ADMIN)
@Controller('questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Get('stats')
  stats() {
    return this.questionsService.stats();
  }

  @Get()
  findAll(
    @Query() pagination: PaginationDto,
    @Query('subjectId') subjectId?: string,
    @Query('topicId') topicId?: string,
    @Query('tagId') tagId?: string,
    @Query('fullyEligible') fullyEligible?: string,
  ) {
    return this.questionsService.findAll({
      ...pagination,
      subjectId,
      topicId,
      tagId,
      fullyEligible: fullyEligible === 'true',
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.questionsService.findOne(id);
  }

  @Post()
  create(
    @Body() dto: CreateQuestionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.questionsService.create(dto, user.id);
  }

  @Post('import')
  import(
    @Body() dto: ImportQuestionsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.questionsService.importMany(dto.questions, user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateQuestionDto) {
    return this.questionsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.questionsService.remove(id);
  }

  @Post(':id/publish')
  publish(@Param('id') id: string) {
    return this.questionsService.publish(id);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string) {
    return this.questionsService.reject(id);
  }

  @Post(':id/archive')
  archive(@Param('id') id: string) {
    return this.questionsService.archive(id);
  }
}
