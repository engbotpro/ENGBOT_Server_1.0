// src/types/user.types.ts

export interface UserAttributes {
    id: number;
    nip: string;
    foto?: string | null;
    senha: string;
    nGuerra: string;
    nome: string;
    corpo?: string | null;
    partido?: string | null;
    forca?: string | null;
    posto?: string | null;
    aperfeicoamento?: string | null;
    perfil: string;
    estado: string;
    email?: string | null;
    primeiroAcesso: boolean | string;
    quadro?: string | null; // Adicionado o campo quadro
    confirmed?: string | null;
  }
  
  export interface UserCreationAttributes
    extends Partial<
      Omit<UserAttributes, "id"> // Exclui `id`, que é gerado automaticamente
    > {}
  