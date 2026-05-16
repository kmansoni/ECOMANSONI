import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, BarChart2, Clock, Users, Shuffle, Eye, MessageSquare, Globe } from "lucide-react";
import { usePolls, CreatePollInput } from "@/hooks/usePolls";

interface CreatePollSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  onCreated?: (pollId: string) => void;
}

export function CreatePollSheet({ open, onOpenChange, conversationId, onCreated }: CreatePollSheetProps) {
  const { createPoll } = usePolls(conversationId);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [allowsMultiple, setAllowsMultiple] = useState(false);
  const [isQuiz, setIsQuiz] = useState(false);
  const [correctIndex, setCorrectIndex] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  // Polls 2.0 options
  const [allowAddingOptions, setAllowAddingOptions] = useState(false);
  const [hideResults, setHideResults] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [timeLimit, setTimeLimit] = useState<number>(0); // 0 = unlimited
  const [description, setDescription] = useState("");

  const addOption = () => {
    if (options.length < 10) setOptions((prev) => [...prev, ""]);
  };

  const removeOption = (idx: number) => {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, i) => i !== idx));
    if (correctIndex === idx) setCorrectIndex(null);
    else if (correctIndex !== null && idx < correctIndex) setCorrectIndex(correctIndex - 1);
  };

  const setOption = (idx: number, val: string) => {
    setOptions((prev) => prev.map((o, i) => (i === idx ? val : o)));
  };

  const handleCreate = async () => {
    const validOptions = options.filter((o) => o.trim());
    if (!question.trim() || validOptions.length < 2) return;

    setCreating(true);
    const input: CreatePollInput = {
      question: question.trim(),
      options: validOptions,
      poll_type: isQuiz ? "quiz" : allowsMultiple ? "multiple" : "regular",
      is_anonymous: isAnonymous,
      allows_multiple: allowsMultiple,
      correct_option_index: isQuiz ? correctIndex : null,
      // Polls 2.0
      allow_adding_options: allowAddingOptions,
      hide_results_until_closed: hideResults,
      shuffle_options: shuffleOptions,
      time_limit: timeLimit > 0 ? timeLimit : undefined,
      description: description.trim() || undefined,
    };

    const pollId = await createPoll(input);
    setCreating(false);

    if (pollId) {
      onCreated?.(pollId);
      onOpenChange(false);
      // Reset
      setQuestion("");
      setOptions(["", ""]);
      setIsAnonymous(false);
      setAllowsMultiple(false);
      setIsQuiz(false);
      setCorrectIndex(null);
    }
  };

  const canCreate = question.trim().length > 0 && options.filter((o) => o.trim()).length >= 2;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-[#1c1c1e] border-white/10 rounded-t-2xl max-h-[90vh] flex flex-col p-0">
        <SheetHeader className="px-4 pt-4 pb-2 shrink-0">
          <SheetTitle className="flex items-center gap-2 text-white">
            <BarChart2 className="w-5 h-5 text-blue-400" />
            Создать опрос
          </SheetTitle>
          <SheetDescription className="text-white/50">
            Укажите вопрос и минимум два варианта ответа.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 space-y-4 pb-4">
          {/* Question */}
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">Вопрос</label>
            <Textarea
              placeholder="Введите вопрос..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30 resize-none"
              rows={2}
            />
          </div>

          {/* Options */}
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">Варианты ответов</label>
            <div className="space-y-2">
              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  {isQuiz && (
                    <button
                      onClick={() => setCorrectIndex(idx)}
                      className={`w-5 h-5 rounded-full border-2 shrink-0 transition-colors ${
                        correctIndex === idx
                          ? "border-emerald-500 bg-emerald-500"
                          : "border-white/20"
                      }`}
                    />
                  )}
                  <Input
                    value={opt}
                    onChange={(e) => setOption(idx, e.target.value)}
                    placeholder={`Вариант ${idx + 1}`}
                    className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-white/30"
                  />
                  <button
                    onClick={() => removeOption(idx)}
                    disabled={options.length <= 2}
                    className="text-white/30 hover:text-white/60 disabled:opacity-20 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            {options.length < 10 && (
              <button
                onClick={addOption}
                className="mt-2 flex items-center gap-1.5 text-sm text-[#6ab3f3] hover:text-[#6ab3f3]/80 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Добавить вариант
              </button>
            )}
          </div>

          {/* Toggles */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white">Анонимное голосование</p>
                <p className="text-xs text-white/40">Не показывать кто голосовал</p>
              </div>
              <Switch checked={isAnonymous} onCheckedChange={setIsAnonymous} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white">Несколько ответов</p>
                <p className="text-xs text-white/40">Выбор более одного варианта</p>
              </div>
              <Switch
                checked={allowsMultiple}
                onCheckedChange={(v) => {
                  setAllowsMultiple(v);
                  if (v) setIsQuiz(false);
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white">Режим викторины</p>
                <p className="text-xs text-white/40">Укажите правильный ответ</p>
              </div>
              <Switch
                checked={isQuiz}
                onCheckedChange={(v) => {
                  setIsQuiz(v);
                  if (v) setAllowsMultiple(false);
                  if (!v) setCorrectIndex(null);
                }}
              />
            </div>

            {/* Polls 2.0: New Options */}
            {!isQuiz && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white">Разрешить добавлять варианты</p>
                    <p className="text-xs text-white/40">Участники могут предлагать свои варианты</p>
                  </div>
                  <Switch checked={allowAddingOptions} onCheckedChange={setAllowAddingOptions} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white">Скрыть результаты до закрытия</p>
                    <p className="text-xs text-white/40">Результаты видны только после завершения опроса</p>
                  </div>
                  <Switch checked={hideResults} onCheckedChange={setHideResults} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white">Перемешать варианты</p>
                    <p className="text-xs text-white/40">Каждый видит варианты в случайном порядке</p>
                  </div>
                  <Switch checked={shuffleOptions} onCheckedChange={setShuffleOptions} />
                </div>
              </>
            )}

            {/* Time Limit */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-white/50" />
                <div>
                  <p className="text-sm text-white">Ограничение по времени</p>
                  <p className="text-xs text-white/40">Сколько секунд на голосование</p>
                </div>
              </div>
              <Input
                type="number"
                min={0}
                max={86400}
                value={timeLimit || ""}
                onChange={(e) => setTimeLimit(Math.max(0, parseInt(e.target.value) || 0))}
                placeholder="∞"
                className="w-20 bg-white/5 border-white/10 text-white text-sm text-center"
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-xs text-white/50 mb-1.5 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" />
                Подробнее об опросе
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Добавьте контекст или уточнения"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 resize-none"
                rows={2}
              />
            </div>
          </div>
        </div>

        <div className="px-4 pb-6 pt-2 shrink-0">
          <Button
            onClick={handleCreate}
            disabled={!canCreate || creating}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white"
          >
            {creating ? "Создание..." : "Создать опрос"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
