export const MemoryService = {
  getMemories: (): string[] => {
    try {
      const stored = localStorage.getItem('GERDA_MEMORY');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },
  saveMemory: (fact: string) => {
    try {
      let memories = MemoryService.getMemories();
      memories.push(fact);
      // Keep only last 10 memories
      if (memories.length > 10) {
        memories = memories.slice(-10);
      }
      localStorage.setItem('GERDA_MEMORY', JSON.stringify(memories));
      console.log("Memory saved:", fact);
    } catch (e) {
      console.error("Failed to save memory", e);
    }
  }
};
