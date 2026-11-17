' Roda o scripts/cardapio.mjs escondido (sem piscar janela). Chamado pelo Agendador de Tarefas:
' tarefa "Publicador - cardapio do Villa", todo dia das 7h as 15h, a cada 5 min.
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\Users\Pedro\Desktop\SISTEMAS\publicador"
sh.Run "cmd /c node scripts\cardapio.mjs >> cardapio.log 2>&1", 0, True
