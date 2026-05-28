import { useState, useEffect, useRef } from 'react';
import mondaySdk from 'monday-sdk-js';

const monday = mondaySdk();
const CLIENT_BOARD_ID = 18414756407;
const ITEMS_PER_PAGE = 5;

const PROJECT_STATUS_OPTIONS = [
  { value: 'Assigned',     label: 'Assigned',     color: '#00A9FF' },
  { value: 'Acknowledged', label: 'Acknowledged', color: '#8337be' },
  { value: 'In progress',  label: 'In progress',  color: '#FFAB40' },
  { value: 'On hold',      label: 'On hold',      color: '#FF3D57' },
  { value: 'Completed',    label: 'Completed',    color: '#00C875' },
];

const SUBITEM_STATUS_OPTIONS = [
  { value: 'Done',        label: 'Done',        color: '#00C875' },
  { value: 'In progress', label: 'In progress', color: '#00A9FF' },
  { value: 'Stuck',       label: 'Stuck',       color: '#FF3D57' },
  { value: 'Not started', label: 'Not started', color: null },
];

function StatusDropdown({ value, options, onChange, size = 'md' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (!btnRef.current?.contains(e.target) && !menuRef.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const wouldOverflow = r.bottom + 220 > window.innerHeight;
      setPos({
        top: wouldOverflow ? r.top - 226 : r.bottom + 6,
        right: window.innerWidth - r.right,
      });
    }
    setOpen(o => !o);
  };

  const current = options.find(o => o.value === value);
  const pillBg = current?.color ?? '#dcd9d9';
  const pillColor = current?.color ? '#fff' : '#464555';

  return (
    <>
      <button
        ref={btnRef}
        className={`flex items-center gap-1 rounded-full font-semibold hover:opacity-80 transition-opacity whitespace-nowrap ${
          size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'
        }`}
        style={{ backgroundColor: pillBg, color: pillColor }}
        onClick={toggle}
      >
        {current?.label ?? value ?? '—'}
        <span className="material-symbols-outlined" style={{ fontSize: '14px', lineHeight: 1 }}>
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {open && (
        <div
          ref={menuRef}
          className="fixed z-[9999] bg-surface-container-lowest border border-border-subtle rounded-xl shadow-xl py-1 min-w-[160px]"
          style={{ top: pos.top, right: pos.right }}
        >
          {options.map(opt => (
            <button
              key={opt.value}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-on-surface hover:bg-surface-container-low transition-colors ${
                opt.value === value ? 'bg-surface-container-low' : ''
              }`}
              onClick={() => { onChange(opt.value); setOpen(false); }}
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: opt.color ?? '#dcd9d9' }}
              />
              <span>{opt.label}</span>
              {opt.value === value && (
                <span className="material-symbols-outlined ml-auto text-primary" style={{ fontSize: '14px' }}>
                  check
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function App() {
  const [boardName, setBoardName] = useState("Loading...");
  const [items, setItems] = useState([]);
  const [users, setUsers] = useState([]);

  const [filterLocation, setFilterLocation] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterDate, setFilterDate] = useState('All');

  const [expandedItems, setExpandedItems] = useState({});
  const [aiModal, setAiModal] = useState({ isOpen: false, text: "", isLoading: false });
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchBoardData(CLIENT_BOARD_ID);
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterLocation, filterStatus, filterDate]);

  const fetchBoardData = async (boardId) => {
    try {
      const query = `
        query {
          boards(ids: ${boardId}) {
            name
            items_page(limit: 500) {
              items {
                id
                name
                column_values { id text value }
                subitems {
                  id
                  name
                  board { id }
                  column_values { id text value }
                }
              }
            }
          }
          users(limit: 100) { id name photo_thumb_small }
        }
      `;

      const response = await monday.api(query, { apiVersion: '2024-01' });
      const boardData = response.data.boards[0];

      setBoardName(boardData.name);
      setItems(boardData.items_page.items);
      setUsers(response.data.users);
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  const updateItemStatus = async (boardIdToUpdate, itemIdToUpdate, columnIdToUpdate, newLabelValue) => {
    if (!newLabelValue) return;
    try {
      const mutation = `
        mutation change_status($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
          change_simple_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) {
            id
          }
        }
      `;
      const variables = {
        boardId: parseInt(boardIdToUpdate),
        itemId: parseInt(itemIdToUpdate),
        columnId: columnIdToUpdate,
        value: newLabelValue
      };
      const response = await monday.api(mutation, { variables, apiVersion: '2024-01' });
      if (response.errors) {
        console.error("Mutation Error:", response.errors);
        alert("Action blocked by monday.com permissions. Check console.");
        return;
      }
      fetchBoardData(CLIENT_BOARD_ID);
    } catch (error) {
      console.error("Network error during mutation:", error);
    }
  };

  const sendSubmissionToN8n = async (projectId) => {
    try {
      const webhookUrl = "https://automate.worktables.io/webhook-test/client-submit";
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: projectId,
          action: "client_submission",
          message: "O cliente enviou uma atualização pelo Portal UI."
        })
      });
      alert("Alerta enviado ao Project Manager com sucesso!");
    } catch (error) {
      console.error("Erro ao notificar PM:", error);
      alert("Falha ao comunicar com o servidor.");
    }
  };

  // --- Helper Functions ---
  const getColumnText = (item, columnId) => {
    const column = item.column_values?.find(c => c.id === columnId);
    return column ? column.text : '';
  };

  const toggleAccordion = (id) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Project status colors — 5 options: Assigned, Acknowledged, In progress, On hold, Completed
  const getProjectStatusColor = (statusText) => {
    if (!statusText || statusText === '') return 'bg-surface-dim text-on-surface-variant';
    const text = statusText.toLowerCase();
    if (text.includes('completed')) return 'bg-status-success text-white';
    if (text.includes('in progress')) return 'bg-[#FFAB40] text-white';
    if (text.includes('on hold')) return 'bg-status-critical text-white';
    if (text.includes('acknowledged')) return 'bg-[#8337be] text-white';
    if (text.includes('assigned')) return 'bg-status-info text-white';
    return 'bg-surface-dim text-on-surface-variant';
  };

  // Sub-item status colors — 4 options kept as-is: Done, In progress, Stuck, Not started
  const getStatusColor = (statusText) => {
    if (!statusText || statusText === '') return 'bg-surface-dim text-on-surface-variant';
    const text = statusText.toLowerCase();
    if (text.includes('done')) return 'bg-status-success text-white';
    if (text.includes('in progress') || text.includes('working')) return 'bg-status-info text-white';
    if (text.includes('paused') || text.includes('stuck')) return 'bg-status-critical text-white';
    if (text.includes('not started')) return 'bg-surface-dim text-on-surface-variant';
    return 'bg-status-warning text-white';
  };

  // --- HELPER: ENCONTRAR O DONO DA TAREFA ---
  const getTaskOwner = (taskColumnValues) => {
    const peopleColumn = taskColumnValues.find(c => c.id === 'person' || c.id === 'owner' || c.id === 'people');
    if (!peopleColumn || !peopleColumn.value) return null;
    try {
      const parsedValue = JSON.parse(peopleColumn.value);
      if (parsedValue.personsAndTeams && parsedValue.personsAndTeams.length > 0) {
        const assignedUserId = parsedValue.personsAndTeams[0].id;
        const matchedUser = users.find(u => Number(u.id) === Number(assignedUserId));
        return matchedUser;
      }
    } catch (error) {
      console.error("Erro ao ler dono da tarefa:", error);
    }
    return null;
  };

  const getCompletionPercentage = (subitems) => {
    if (!subitems || subitems.length === 0) return 0;
    const doneCount = subitems.filter(sub => {
      const status = getColumnText(sub, 'status').toLowerCase();
      return status.includes('done');
    }).length;
    return Math.round((doneCount / subitems.length) * 100);
  };

  // --- HELPER: ENCONTRAR O LÍDER DO PROJETO ---
  const getProjectLead = (projectColumnValues) => {
    const leadColumn = projectColumnValues.find(c => c.id === 'lead' || c.id === 'person' || c.id === 'people');
    if (!leadColumn || !leadColumn.value) return null;
    try {
      const parsedValue = JSON.parse(leadColumn.value);
      if (parsedValue.personsAndTeams && parsedValue.personsAndTeams.length > 0) {
        const leadId = parsedValue.personsAndTeams[0].id;
        return users.find(u => Number(u.id) === Number(leadId));
      }
    } catch (error) {
      console.error("Erro ao ler líder do projeto:", error);
    }
    return null;
  };

  // --- Filtering Logic ---
  const filteredItems = items.filter(item => {
    const locMatch = filterLocation === 'All' ? true : getColumnText(item, 'location_dropdown') === filterLocation;

    const stageText = getColumnText(item, 'project_stage').toLowerCase();
    let statusMatch = true;
    if (filterStatus !== 'All') {
      if (filterStatus === 'Completed') statusMatch = stageText.includes('completed');
      else if (filterStatus === 'In Progress') statusMatch = stageText.includes('in progress');
      else if (filterStatus === 'On Hold') statusMatch = stageText.includes('on hold');
      else if (filterStatus === 'Acknowledged') statusMatch = stageText.includes('acknowledged');
      else if (filterStatus === 'Assigned') statusMatch = stageText.includes('assigned');
    }

    let dateMatch = true;
    if (filterDate !== 'All') {
      const dueDateText = getColumnText(item, 'due_date');
      if (dueDateText === 'N/A' || !dueDateText) {
        dateMatch = false;
      } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const [year, month, day] = dueDateText.split('-');
        const dueDate = new Date(year, month - 1, day);
        if (filterDate === 'Overdue') dateMatch = dueDate < today;
        if (filterDate === 'Upcoming') dateMatch = dueDate >= today;
      }
    }

    return locMatch && statusMatch && dateMatch;
  });

  // --- Global Metrics ---
  const totalProjects = items.length;
  const completedCount = items.filter(i => getColumnText(i, 'project_stage').toLowerCase().includes('completed')).length;
  const inProgressCount = items.filter(i => getColumnText(i, 'project_stage').toLowerCase().includes('in progress')).length;
  const onHoldCount = items.filter(i => getColumnText(i, 'project_stage').toLowerCase().includes('on hold')).length;
  const acknowledgedCount = items.filter(i => getColumnText(i, 'project_stage').toLowerCase().includes('acknowledged')).length;
  const assignedCount = items.filter(i => getColumnText(i, 'project_stage').toLowerCase().includes('assigned')).length;

  const progressPercentage = totalProjects === 0 ? 0 : Math.round((completedCount / totalProjects) * 100);
  const defaultUserPhoto = users.length > 0 ? users[0].photo_thumb_small : "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png";

  // --- Pagination ---
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));
  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const getPageNumbers = () => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const range = new Set([1, totalPages]);
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      range.add(i);
    }
    return [...range].sort((a, b) => a - b);
  };

  // --- GERADOR DE RESUMO IA (COM VERIFICAÇÃO PRÉVIA / CACHE) ---
  const handleGenerateAI = async (itemId) => {
    // Dá um feedback imediato na UI
    setAiModal({ isOpen: true, text: "Buscando resumo do projeto...", isLoading: true });

    try {
      // 1. VERIFICA SE O RESUMO JÁ EXISTE NO BANCO DE DADOS
      const checkInitialQuery = `
        query {
          items(ids: [${itemId}]) {
            column_values(ids: ["executive_summary"]) { text }
          }
        }
      `;
      const initialResponse = await monday.api(checkInitialQuery);
      const existingText = initialResponse.data?.items[0]?.column_values[0]?.text;

      // Se o texto já existir e não for vazio, exibe ele e PARA a função aqui!
      if (existingText && existingText.trim() !== "") {
        console.log("▶️ Resumo já existe! Puxando direto da coluna.");
        setAiModal({ isOpen: true, text: existingText, isLoading: false });
        return; // O 'return' impede que o código continue e dispare o n8n
      }

      // 2. SE NÃO EXISTE, DISPARA O GATILHO PARA O N8N GERAR
      console.log("▶️ Resumo não existe. Acionando a IA...");
      setAiModal({ isOpen: true, text: "Ai is a Loading...", isLoading: true });
      
      const triggerMutation = `
        mutation {
          change_simple_column_value(
            item_id: ${itemId}, 
            board_id: ${CLIENT_BOARD_ID}, 
            column_id: "ai_trigger", 
            value: "Gerar" 
          ) { id }
        }
      `;
      await monday.api(triggerMutation);

      // 3. INICIA A SONDAGEM (POLLING) PARA ESPERAR A RESPOSTA
      let attempts = 0;
      const maxAttempts = 15;
      
      const intervalId = setInterval(async () => {
        attempts++;
        console.log(`▶️ Sondagem ${attempts}...`);
        
        const checkQuery = `
          query {
            items(ids: [${itemId}]) {
              column_values(ids: ["executive_summary"]) { text }
            }
          }
        `;
        const checkResponse = await monday.api(checkQuery);
        const fetchedText = checkResponse.data?.items[0]?.column_values[0]?.text;

        if (fetchedText && fetchedText.trim() !== "") {
          clearInterval(intervalId);
          setAiModal({ isOpen: true, text: fetchedText, isLoading: false });
        } else if (attempts >= maxAttempts) {
          clearInterval(intervalId);
          setAiModal({ isOpen: true, text: "Tempo limite esgotado. Tente novamente.", isLoading: false });
        }
      }, 3000);

    } catch (error) {
      console.error("❌ ERRO:", error);
      setAiModal({ isOpen: true, text: "Falha de comunicação no React. Veja o console.", isLoading: false });
    }
  };

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden font-body-md">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* TopAppBar */}
        <header className="flex justify-between items-center w-full px-6 h-16 bg-surface-container-lowest border-b border-border-subtle shadow-sm z-40">
          <div className="w-[200px] hidden md:block" />
          <div className="relative w-full max-w-xl flex-1 mx-4">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-sm">search</span>
            <input
              className="w-full pl-10 pr-4 py-1.5 bg-surface-muted rounded-full border-none focus:ring-2 focus:ring-primary font-body-md text-sm outline-none"
              placeholder="Search projects..."
              type="text"
            />
          </div>
          <div className="w-auto md:w-[200px] flex justify-end">
            <div
              className="flex items-center gap-1.5 px-3 py-1 bg-surface-container-low rounded-full border border-border-subtle"
              title="Secure Client Portal"
            />
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-background p-6">
          <div className="max-w-7xl mx-auto">

            {/* Content Header & Filters */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
              <div>
                <h1 className="text-3xl font-bold text-on-background">Project Overview</h1>
                <p className="text-on-surface-variant text-sm mt-1">{boardName}</p>
              </div>

              <div className="flex items-center gap-3 bg-surface-container-lowest p-2 rounded-xl border border-border-subtle shadow-sm flex-wrap">
                <div className="flex items-center gap-2 px-3 py-1.5 border-r border-border-subtle">
                  <select
                    className="bg-transparent border-none text-sm font-semibold focus:ring-0 text-on-surface cursor-pointer outline-none"
                    value={filterLocation}
                    onChange={(e) => setFilterLocation(e.target.value)}
                  >
                    <option value="All">Location: All</option>
                    <option value="Colorado">Colorado</option>
                    <option value="Michigan">Michigan</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 px-3 py-1.5 border-r border-border-subtle">
                  <span className="material-symbols-outlined text-outline text-sm">filter_list</span>
                  <select
                    className="bg-transparent border-none text-sm font-semibold focus:ring-0 text-on-surface cursor-pointer outline-none"
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                  >
                    <option value="All">Status: All</option>
                    <option value="Assigned">Assigned</option>
                    <option value="Acknowledged">Acknowledged</option>
                    <option value="In Progress">In Progress</option>
                    <option value="On Hold">On Hold</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 px-3 py-1.5">
                  <span className="material-symbols-outlined text-outline text-sm">calendar_month</span>
                  <select
                    className="bg-transparent border-none text-sm font-semibold focus:ring-0 text-on-surface cursor-pointer outline-none"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                  >
                    <option value="All">Due Dates: All</option>
                    <option value="Upcoming">Upcoming / On Time</option>
                    <option value="Overdue">Overdue</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Two-Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

              {/* Left Column: Project List */}
              <div className="lg:col-span-7 space-y-4">
                <div className="bg-surface-container-lowest rounded-xl border border-border-subtle overflow-hidden shadow-sm">

                  {filteredItems.length === 0 && (
                    <div className="p-8 text-center text-outline font-semibold">No projects match the selected filters.</div>
                  )}

                  {paginatedItems.map((item, index) => {
                    const statusText = getColumnText(item, 'project_stage');
                    const isExpanded = !!expandedItems[item.id];
                    const subitems = item.subitems || [];

                    const itemCompletion = getCompletionPercentage(subitems);
                    const barColor = itemCompletion === 100 ? 'bg-status-success' : itemCompletion >= 50 ? 'bg-status-info' : 'bg-status-critical';
                    const textColor = itemCompletion === 100 ? 'text-status-success' : itemCompletion >= 50 ? 'text-status-info' : 'text-status-critical';
                    const isLast = index === paginatedItems.length - 1;

                    return (
                      <div key={item.id} className={`transition-all duration-200 hover:bg-surface-container-low hover:shadow-sm ${!isLast ? 'border-b border-border-subtle' : ''}`}>
                        <div className="p-4 flex items-center justify-between">
                          <div className="flex items-center gap-4 flex-1">
                            {/* FOTO DO LÍDER DINÂMICA */}
                            {(() => {
                              const projectLead = getProjectLead(item.column_values);
                              return (
                                <div
                                  className="w-10 h-10 rounded-full border-2 border-surface-muted p-0.5 shrink-0 bg-surface-container-low flex items-center justify-center overflow-hidden"
                                  title={projectLead ? `Project Lead: ${projectLead.name}` : "Unassigned"}
                                >
                                  {projectLead ? (
                                    <img alt={projectLead.name} className="w-full h-full rounded-full object-cover" src={projectLead.photo_thumb_small} />
                                  ) : (
                                    <span className="material-symbols-outlined text-on-surface-variant text-xl">person_off</span>
                                  )}
                                </div>
                              );
                            })()}
                            <div>
                              <h3 className="text-lg font-semibold text-on-surface">{item.name}</h3>
                              <div className="text-on-surface-variant flex items-center gap-3 text-xs mt-1">
                                {getColumnText(item, 'location_dropdown') && (
                                  <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-surface-muted border border-border-subtle text-on-surface-variant font-medium">
                                    <span className="material-symbols-outlined text-[13px]">location_on</span>
                                    {getColumnText(item, 'location_dropdown')}
                                  </span>
                                )}
                                <div className="flex items-center gap-1">
                                  <span className="material-symbols-outlined text-sm">event</span>
                                  <span className="font-semibold">Due Date:</span> {getColumnText(item, 'due_date') || 'TBD'}
                                </div>
                                <button
                                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-surface-muted text-primary hover:bg-primary-fixed border border-primary-fixed-dim transition-colors cursor-pointer text-xs font-medium"
                                  onClick={() => handleGenerateAI(item.id)}
                                >
                                  <span className="material-symbols-outlined text-[14px]">auto_awesome</span> AI Resume
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* PROJECT STATUS — 5 options */}
                          <div className="flex items-center gap-4">
                            <StatusDropdown
                              value={statusText || ''}
                              options={PROJECT_STATUS_OPTIONS}
                              onChange={(val) => updateItemStatus(CLIENT_BOARD_ID, item.id, 'project_stage', val)}
                            />

                            <button className="p-1 hover:bg-surface-muted rounded-full outline-none" onClick={() => toggleAccordion(item.id)}>
                              <span
                                className="material-symbols-outlined text-outline transition-transform duration-200"
                                style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                              >
                                expand_more
                              </span>
                            </button>
                          </div>
                        </div>

                        {/* Accordion Content */}
                        {isExpanded && (
                          <div className="bg-surface-container-low">
                            <div className="px-6 py-4 border-b border-border-subtle bg-surface-container-low">
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Overall Completion</span>
                                <span className={`text-xl font-bold ${textColor}`}>{itemCompletion}%</span>
                              </div>
                              <div className="w-full bg-surface-muted h-2.5 rounded-full overflow-hidden">
                                <div className={`${barColor} h-full transition-all duration-700`} style={{ width: `${itemCompletion}%` }} />
                              </div>
                            </div>

                            <div className="px-6 py-3 space-y-2">
                              {subitems.length === 0 ? (
                                <span className="text-sm text-outline">No subtasks recorded.</span>
                              ) : (
                                subitems.map(sub => {
                                  const dateCol = sub.column_values?.find(c => c.id.includes('date'));
                                  const subDueDate = dateCol ? dateCol.text : '';
                                  const subStatus = getColumnText(sub, 'status');

                                  return (
                                    <div key={sub.id} className="pb-4 border-b border-border-subtle/50 last:border-0 last:pb-2">
                                      <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                          {/* Dono da subtarefa */}
                                          {(() => {
                                            const owner = getTaskOwner(sub.column_values);
                                            return (
                                              <div className="flex-shrink-0">
                                                {owner ? (
                                                  <img
                                                    src={owner.photo_thumb_small}
                                                    alt={owner.name}
                                                    title={`Assignee: ${owner.name}`}
                                                    className="w-7 h-7 rounded-full border border-border-subtle object-cover"
                                                  />
                                                ) : (
                                                  <div
                                                    className="w-7 h-7 rounded-full bg-surface-container flex items-center justify-center border border-dashed border-border-subtle"
                                                    title="Unassigned"
                                                  >
                                                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant">person_off</span>
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })()}
                                          <span className="text-sm text-on-surface">{sub.name}</span>
                                        </div>

                                        {/* SUB-ITEM STATUS — 4 options, kept as-is */}
                                        <StatusDropdown
                                          value={subStatus || ''}
                                          options={SUBITEM_STATUS_OPTIONS}
                                          onChange={(val) => updateItemStatus(sub.board.id, sub.id, 'status', val)}
                                          size="sm"
                                        />
                                      </div>
                                      <div className="text-[10px] text-outline font-semibold mt-1 uppercase">
                                        Due Date: {subDueDate || 'NO DATE'}
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>

                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-6 flex items-center justify-center gap-2 text-sm">
                    <button
                      className="px-3 py-1.5 text-on-surface-variant hover:bg-surface-container-high rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </button>

                    {(() => {
                      const pageNums = getPageNumbers();
                      const result = [];
                      let lastPage = 0;
                      for (const page of pageNums) {
                        if (lastPage && page - lastPage > 1) {
                          result.push(
                            <span key={`ellipsis-${page}`} className="px-1 text-on-surface-variant">...</span>
                          );
                        }
                        result.push(
                          <button
                            key={page}
                            className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
                              page === currentPage
                                ? 'bg-primary text-white'
                                : 'text-on-surface-variant hover:bg-surface-container-high'
                            }`}
                            onClick={() => setCurrentPage(page)}
                          >
                            {page}
                          </button>
                        );
                        lastPage = page;
                      }
                      return result;
                    })()}

                    <button
                      className="px-3 py-1.5 text-on-surface-variant hover:bg-surface-container-high rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>

              {/* Right Column: Stats & Progress */}
              <div className="lg:col-span-5 space-y-6">

                {/* Workspace Progress Card */}
                <div className="bg-primary rounded-2xl p-6 text-white relative overflow-hidden shadow-lg hover:-translate-y-1 hover:shadow-xl transition-all duration-300 cursor-default">
                  <div className="relative z-10">
                    <h4 className="text-lg font-semibold opacity-80">Workspace Progress</h4>
                    <div className="text-4xl font-bold mt-2">{progressPercentage}%</div>
                  </div>
                  <div className="mt-6 relative z-10">
                    <div className="w-full bg-white/20 h-2 rounded-full overflow-hidden">
                      <div className="bg-white h-full transition-all duration-1000" style={{ width: `${progressPercentage}%` }} />
                    </div>
                    <p className="text-xs mt-2 opacity-90">Based on completed projects</p>
                  </div>
                  <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
                </div>

                {/* Statistics Grid */}
                <div className="grid grid-cols-2 gap-4">

                  {/* Completed */}
                  <div className="bg-surface-container-lowest border border-border-subtle rounded-2xl p-6 flex flex-col items-center justify-center text-center hover:-translate-y-1 hover:shadow-md transition-all duration-300">
                    <span className="material-symbols-outlined text-status-success text-3xl mb-2">check_circle</span>
                    <div className="text-2xl font-bold text-on-surface">{completedCount}</div>
                    <div className="text-xs font-semibold text-on-surface-variant uppercase mb-2">Completed</div>
                    <div className="text-status-success text-xs flex items-center gap-1 bg-status-success/10 px-2 py-0.5 rounded-full font-medium">
                      <span className="material-symbols-outlined text-[12px]">trending_up</span> Done
                    </div>
                  </div>

                  {/* Acknowledged */}
                  <div className="bg-surface-container-lowest border border-border-subtle rounded-2xl p-6 flex flex-col items-center justify-center text-center hover:-translate-y-1 hover:shadow-md transition-all duration-300">
                    <span className="material-symbols-outlined text-[#8337be] text-3xl mb-2">mark_email_read</span>
                    <div className="text-2xl font-bold text-on-surface">{acknowledgedCount}</div>
                    <div className="text-xs font-semibold text-on-surface-variant uppercase mb-2">Acknowledged</div>
                    <div className="text-[#8337be] text-xs flex items-center gap-1 bg-[#8337be]/10 px-2 py-0.5 rounded-full font-medium">
                      <span className="material-symbols-outlined text-[12px]">trending_flat</span> In Review
                    </div>
                  </div>

                  {/* Assigned */}
                  <div className="bg-surface-container-lowest border border-border-subtle rounded-2xl p-6 flex flex-col items-center justify-center text-center hover:-translate-y-1 hover:shadow-md transition-all duration-300">
                    <span className="material-symbols-outlined text-status-info text-3xl mb-2">assignment</span>
                    <div className="text-2xl font-bold text-on-surface">{assignedCount}</div>
                    <div className="text-xs font-semibold text-on-surface-variant uppercase mb-2">Assigned</div>
                    <div className="text-status-info text-xs flex items-center gap-1 bg-status-info/10 px-2 py-0.5 rounded-full font-medium">
                      <span className="material-symbols-outlined text-[12px]">trending_up</span> Active
                    </div>
                  </div>

                  {/* On Hold */}
                  <div className="bg-surface-container-lowest border border-border-subtle rounded-2xl p-6 flex flex-col items-center justify-center text-center hover:-translate-y-1 hover:shadow-md transition-all duration-300">
                    <span className="material-symbols-outlined text-status-critical text-3xl mb-2">pause_circle</span>
                    <div className="text-2xl font-bold text-on-surface">{onHoldCount}</div>
                    <div className="text-xs font-semibold text-on-surface-variant uppercase mb-2">On Hold</div>
                    <div className="text-status-critical text-xs flex items-center gap-1 bg-status-critical/10 px-2 py-0.5 rounded-full font-medium">
                      <span className="material-symbols-outlined text-[12px]">trending_down</span> Paused
                    </div>
                  </div>

                </div>
              </div>

            </div>
          </div>
        </main>
      </div>

      {/* Modal de Inteligência Artificial */}
      {aiModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-container-lowest border border-border-subtle rounded-2xl p-8 max-w-lg w-full max-h-[80vh] shadow-2xl flex flex-col relative">

            {/* Botão Fechar — só aparece quando não está carregando */}
            {!aiModal.isLoading && (
              <button
                onClick={() => setAiModal({ isOpen: false, text: "", isLoading: false })}
                className="absolute top-4 right-4 text-on-surface-variant hover:text-on-surface transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            )}

            {/* Cabeçalho dinâmico */}
            <div className="flex items-center gap-3 mb-4">
              <span
                className={`material-symbols-outlined text-3xl ${
                  aiModal.isLoading
                    ? 'text-[#8337be] animate-spin'
                    : 'text-[#8337be]'
                }`}
              >
                {aiModal.isLoading ? 'sync' : 'auto_awesome'}
              </span>
              <h2 className="text-xl font-bold text-on-surface">AI Executive Summary</h2>
            </div>

            {/* Conteúdo com scroll */}
            <div className="overflow-y-auto flex-1 text-on-surface-variant text-sm leading-relaxed whitespace-pre-wrap bg-surface-container-low p-4 rounded-xl border border-border-subtle">
              {aiModal.text}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

export default App;
